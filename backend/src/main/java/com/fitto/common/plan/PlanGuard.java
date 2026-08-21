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

    /** 기능이 이 사용자에게 열려 있는지만 확인한다 (사용량은 건드리지 않음). */
    public void require(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        if (quota.isBlocked()) {
            logBlocked(userId, feature);
            throw upgradeRequired(feature);
        }
        if (quota.isCounted()) {
            int used = usageCounter.peek(userId, feature, quota);
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
        int used = usageCounter.increment(userId, feature, quota);
        if (used > quota.limit()) {
            logBlocked(userId, feature);
            throw limitExceeded(feature, plan, quota);
        }
        logUsed(userId, feature);
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
        return usageCounter.peek(userId, feature, quota) < quota.limit();
    }

    /** 표시용 — 앱의 잔여 횟수·잠금 배지에 쓴다. */
    public FeatureState state(Long userId, Feature feature) {
        Plan plan = planResolver.resolveFor(userId, feature);
        Quota quota = feature.quotaFor(plan);
        int used = quota.isCounted() ? usageCounter.peek(userId, feature, quota) : 0;
        boolean allowed = !quota.isBlocked()
                && (quota.isUnlimited() || !quota.isCounted() || used < quota.limit());
        Integer remaining = quota.isUnlimited() || quota.isBlocked() || !quota.isCounted()
                ? null
                : Math.max(0, quota.limit() - used);
        return new FeatureState(
                feature.name(), feature.displayName(), allowed,
                quota.limit(), used, remaining, quota.window().name());
    }

    public Plan planOf(Long userId) {
        return planResolver.resolve(userId);
    }

    public boolean isFreeTrial() {
        return planResolver.isFreeTrial();
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
