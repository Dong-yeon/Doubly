package com.fitto.common.plan;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.springframework.stereotype.Component;

/**
 * 기능 사용 전 관문 — <b>모든 플랜 판정이 여기를 지난다.</b>
 *
 * <p>호출부는 세 가지만 쓴다.
 * <pre>
 *   planGuard.require(userId, Feature.MEMORIES);              // 열려 있나만 확인
 *   planGuard.consume(userId, Feature.AI_FOOD_PHOTO);         // 확인 + 사용량 1 차감
 *   planGuard.requireCapacity(userId, Feature.PLACE_PIN, n);  // 이미 n개 가진 상태에서 하나 더
 * </pre>
 *
 * <p><b>초과했을 때 무엇을 던지는가</b>가 이 클래스의 핵심이다.
 * <ul>
 *   <li>무료인데 막힌 기능 → {@code PLAN_UPGRADE_REQUIRED} — 앱이 업그레이드 시트를 띄운다</li>
 *   <li>무료인데 한도 초과 → {@code PLAN_LIMIT_EXCEEDED} — 역시 업그레이드 유도</li>
 *   <li><b>유료인데 한도 초과</b> → {@code USAGE_LIMIT_EXCEEDED} — 이건 업셀이 아니라
 *       단순 남용 방지다. 돈 낸 사람에게 결제를 또 권하면 안 된다</li>
 * </ul>
 *
 * <p><b>이 세 메서드(require/consume/requireCapacity)는 이벤트 로그도 겸한다</b>
 * ({@link AnalyticsEvent#FEATURE_USED}/{@link AnalyticsEvent#FEATURE_BLOCKED}) — 사용자가
 * 직접 누른 동작에서 게이팅을 통과/차단하는 유일한 지점이라, 여기 하나만 계측하면 앱 전체
 * 기능 사용량이 별도 호출부 수정 없이 모인다. {@link #allows}/{@link #state} 는 화면이
 * 자동으로 부르는 조회라 로깅하지 않는다(찍으면 신호가 노이즈에 묻힌다).
 */
@Component
public class PlanGuard {

    private final PlanResolver planResolver;
    private final UsageCounter usageCounter;
    private final EventLogService eventLogService;

    public PlanGuard(PlanResolver planResolver, UsageCounter usageCounter, EventLogService eventLogService) {
        this.planResolver = planResolver;
        this.usageCounter = usageCounter;
        this.eventLogService = eventLogService;
    }

    /**
     * 이 기능의 사용량을 <b>어느 주머니에서</b> 셀지 — 사람인가 커플인가.
     *
     * <p>{@link Feature#isCoupleScoped()} 인 기능은 결과물이 커플 공간에 쌓이므로 누가
     * 올렸는지가 중요하지 않다. 사람마다 따로 세면 한 명이 주로 찍는 실제 사용 패턴에서
     * <b>한쪽만 먼저 막힌다</b> — 같은 앨범을 같이 보는데 한 사람만 못 올리는 상태다.
     *
     * <p>판정({@link PlanResolver#resolveFor})이 이미 관계 단위인 기능들이라, 계측도 같은
     * 관계를 봐야 한다. 둘이 어긋나면 "둘 다 PRO 인데 한 명만 한도에 걸린다"가 된다.
     *
     * <p>커플이 없으면 본인 주머니로 떨어진다 — 판정과 같은 폴백이다.
     */
    private UsageScope scopeOf(Long userId, Feature feature) {
        if (!feature.isCoupleScoped()) {
            return UsageScope.user(userId);
        }
        return planResolver.activeCoupleIdOf(userId)
                .map(UsageScope::relation)
                .orElseGet(() -> UsageScope.user(userId));
    }

    /** 사용량을 셀 주머니 — 사람이거나 관계이거나. */
    private record UsageScope(Long userId, Long relationId) {
        static UsageScope user(Long userId) {
            return new UsageScope(userId, null);
        }

        static UsageScope relation(Long relationId) {
            return new UsageScope(null, relationId);
        }
    }

    private int peekUsage(UsageScope scope, Feature feature, Quota quota) {
        return scope.relationId() != null
                ? usageCounter.peekForRelation(scope.relationId(), feature, quota)
                : usageCounter.peek(scope.userId(), feature, quota);
    }

    private int incrementUsage(UsageScope scope, Feature feature, Quota quota) {
        return scope.relationId() != null
                ? usageCounter.incrementForRelation(scope.relationId(), feature, quota)
                : usageCounter.increment(scope.userId(), feature, quota);
    }

    /** 기능이 이 사용자에게 열려 있는지만 확인한다 (사용량은 건드리지 않음). */
    public void require(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        if (quota.isBlocked()) {
            logBlocked(userId, feature);
            throw upgradeRequired(feature);
        }
        if (quota.isCounted()) {
            int used = peekUsage(scopeOf(userId, feature), feature, quota);
            if (used >= quota.limit()) {
                logBlocked(userId, feature);
                throw limitExceeded(feature, plan, quota);
            }
        }
        logUsed(userId, feature);
    }

    /**
     * 확인한 뒤 사용량을 1 올린다.
     *
     * <p>선차감이다 — 기능이 실패해도 횟수가 소모된다. AI 호출은 실패해도 이미 외부 쿼터를
     * 먹은 뒤일 수 있어서, 실패 시 되돌리면 재시도로 무한히 우회할 수 있다.
     */
    public void consume(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        if (quota.isBlocked()) {
            logBlocked(userId, feature);
            throw upgradeRequired(feature);
        }
        if (quota.isUnlimited() || !quota.isCounted()) {
            logUsed(userId, feature);
            return;
        }
        int used = incrementUsage(scopeOf(userId, feature), feature, quota);
        if (used > quota.limit()) {
            logBlocked(userId, feature);
            throw limitExceeded(feature, plan, quota);
        }
        logUsed(userId, feature);
    }

    /**
     * {@link #consume} 로 차감한 1회를 되돌린다 — <b>선차감이 부당해지는 경우에만</b> 쓴다.
     *
     * <p>위 {@code consume} 주석대로 기본은 선차감이고, 그 근거는 "실패해도 외부 쿼터는 이미
     * 먹었을 수 있다"였다. 그 걱정은 <b>외부 쿼터를 따로 지키는 장치가 없을 때</b>만 유효하다.
     * AI 는 이제 프로젝트 단위 전역 카운터가 따로 막으므로(GeminiClient 참고), 사용자에게
     * 결과를 하나도 주지 못한 실패까지 개인 한도로 물릴 이유가 없다 — 특히 무료의
     * "데이트 코스 월 1회"처럼 희소한 한도는 한 번의 장애로 한 달이 날아간다.
     *
     * <p>되돌림이 로그를 남기지는 않는다. FEATURE_USED 는 "사용자가 눌렀다"는 사실의 기록이고,
     * 그건 실패했더라도 일어난 일이다.
     */
    public void refund(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        if (quota.isBlocked() || quota.isUnlimited() || !quota.isCounted()) {
            return; // 애초에 센 적이 없다
        }
        // 올린 주머니에서 깎는다 — consume 과 같은 scopeOf 를 쓴다(다르면 한도가 안 줄어든다)
        UsageScope scope = scopeOf(userId, feature);
        if (scope.relationId() != null) {
            usageCounter.decrementForRelation(scope.relationId(), feature, quota);
        } else {
            usageCounter.decrement(scope.userId(), feature, quota);
        }
    }

    /**
     * 개수 상한 확인 — 이미 {@code currentCount} 개를 가진 상태에서 하나 더 만들 수 있는가.
     *
     * <p>카운터가 아니라 DB 개수로 판정한다. 지우면 다시 만들 수 있어야 하기 때문이다
     * (여행·맛집 핀·루틴). 개수는 호출부가 세서 넘긴다 — 무엇을 세는지는 도메인마다 다르다.
     */
    public void requireCapacity(Long userId, Feature feature, long currentCount) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        if (quota.isBlocked()) {
            logBlocked(userId, feature);
            throw upgradeRequired(feature);
        }
        if (quota.isUnlimited()) {
            logUsed(userId, feature);
            return;
        }
        if (currentCount >= quota.limit()) {
            logBlocked(userId, feature);
            throw limitExceeded(feature, plan, quota);
        }
        logUsed(userId, feature);
    }

    private void logUsed(Long userId, Feature feature) {
        eventLogService.log(userId, AnalyticsEvent.FEATURE_USED, feature.name());
    }

    private void logBlocked(Long userId, Feature feature) {
        eventLogService.log(userId, AnalyticsEvent.FEATURE_BLOCKED, feature.name());
    }

    /**
     * 던지지 않는 확인 — 열려 있으면 {@code true}.
     *
     * <p><b>화면이 자동으로 부르는 조회</b>에 쓴다. 홈·마이 탭이 켜질 때마다 402 가 날아가면
     * 앱을 열 때마다 업그레이드 시트가 뜬다. 그런 곳은 막는 대신 <b>잠김 표시로 내려주고</b>
     * 화면이 그 자리에 안내를 그리게 한다. 402 는 사용자가 직접 누른 동작에만 쓴다.
     */
    public boolean allows(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        if (quota.isBlocked()) {
            return false;
        }
        if (!quota.isCounted()) {
            return true;
        }
        return peekUsage(scopeOf(userId, feature), feature, quota) < quota.limit();
    }

    /** 표시용 — 앱의 잔여 횟수·잠금 배지에 쓴다. */
    public FeatureState state(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        int used = quota.isCounted() ? peekUsage(scopeOf(userId, feature), feature, quota) : 0;
        boolean allowed = !quota.isBlocked()
                && (quota.isUnlimited() || !quota.isCounted() || used < quota.limit());
        Integer remaining = quota.isUnlimited() || quota.isBlocked() || !quota.isCounted()
                ? null
                : Math.max(0, quota.limit() - used);
        return new FeatureState(
                feature.name(), feature.displayName(), allowed,
                quota.limit(), used, remaining, quota.window().name(),
                // limitExceeded 와 같은 근거 — 최상위 플랜이면 팔 것이 없다.
                !plan.isAtLeast(Plan.PRO));
    }

    public Plan planOf(Long userId) {
        return planResolver.resolve(userId);
    }

    /** 이 사람이 체험 중인가 — 전역 플래그 또는 가입 후 N일. */
    public boolean isInTrial(Long userId) {
        return planResolver.isInTrial(userId);
    }

    /** 이 사람의 체험 종료 시각. 전역 체험 중이면 null(끝이 정해져 있지 않다). */
    public java.time.LocalDateTime trialEndsAt(Long userId) {
        return planResolver.trialEndsAt(userId);
    }

    private BusinessException upgradeRequired(Feature feature) {
        return new BusinessException(ErrorCode.PLAN_UPGRADE_REQUIRED,
                "%s PRO에서 이용할 수 있어요.".formatted(topicParticle(feature.displayName())));
    }

    /**
     * 조사 자동 선택 — "사진 업로드을(를)" 같은 문구가 사용자에게 보이지 않게 한다.
     *
     * <p>한글 음절의 종성 유무는 {@code (코드 - 0xAC00) % 28} 로 판별한다(0 이면 받침 없음).
     * 한글이 아닌 글자로 끝나면 판별할 수 없으므로 병기 형태로 둔다.
     */
    private static String objectParticle(String word) {
        return word + switch (jongseong(word)) {
            case YES -> "을";
            case NO -> "를";
            case UNKNOWN -> "을(를)";
        };
    }

    private static String topicParticle(String word) {
        return word + switch (jongseong(word)) {
            case YES -> "은";
            case NO -> "는";
            case UNKNOWN -> "은(는)";
        };
    }

    private enum Jongseong { YES, NO, UNKNOWN }

    private static Jongseong jongseong(String word) {
        if (word == null || word.isEmpty()) {
            return Jongseong.UNKNOWN;
        }
        char last = word.charAt(word.length() - 1);
        if (last < 0xAC00 || last > 0xD7A3) {
            return Jongseong.UNKNOWN;
        }
        return (last - 0xAC00) % 28 == 0 ? Jongseong.NO : Jongseong.YES;
    }

    private BusinessException limitExceeded(Feature feature, Plan plan, Quota quota) {
        String period = switch (quota.window()) {
            case DAY -> "하루";
            case WEEK -> "일주일";
            case MONTH -> "한 달";
            case TOTAL, NONE -> null;
        };
        if (plan.isAtLeast(Plan.PRO)) {
            // 이미 최상위 플랜 — 업셀할 것이 없다. 남용 방지 한도에 걸린 것뿐이다.
            return new BusinessException(ErrorCode.USAGE_LIMIT_EXCEEDED,
                    period == null
                            ? "%s 이용 한도를 모두 사용했어요.".formatted(feature.displayName())
                            : "%s %s에 %d회까지 이용할 수 있어요."
                                    .formatted(topicParticle(feature.displayName()), period, quota.limit()));
        }
        return new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED,
                period == null
                        ? "무료 플랜은 %s %d개까지 만들 수 있어요."
                                .formatted(objectParticle(feature.displayName()), quota.limit())
                        : "무료 플랜은 %s %s에 %d회까지 쓸 수 있어요."
                                .formatted(objectParticle(feature.displayName()), period, quota.limit()));
    }
}
