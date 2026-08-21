package com.fitto.call.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Plan;
import com.fitto.common.plan.PlanResolver;
import com.fitto.common.time.KstClock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 커플당 월 통화 시간 안전망 — {@link com.fitto.common.plan.Feature}/{@link com.fitto.common.plan.Quota}/
 * {@link com.fitto.common.plan.UsageCounter} 체계로 표현할 수 없어 별도로 둔다
 * (docs/PRO_PLAN_DESIGN.md "통화·영상통화" 절 참고).
 *
 * <p>기존 게이트는 전부 "사용자 1명 × 기간"으로 세는데, 통화는 "<b>커플 1쌍 × 연속된
 * 초(秒)</b>"를 누적해야 한다 — 거는 사람 기준으로 세면 상대방은 무제한으로 보인다.
 * 그래서 키를 {@code coupleId}로 잡고, 매번 1이 아니라 {@code durationSec}만큼 증가시킨다.
 *
 * <p><b>목적은 판매가 아니라 Stream Video 무료 티어(Maker Account 월 333,000
 * 참가자-분) 보호</b>다 — {@code AI_TOTAL}이 Gemini 프로젝트 쿼터를 보호하는 것과 같은
 * 성격이라, 초과 시 402(업셀)가 아니라 429(남용 방지)를 던진다. FREE·PRO 값 차이는
 * "PRO 는 더 넉넉하게"일 뿐, 이 자체가 판매 문구는 아니다.
 *
 * <p><b>판정 시점도 다른 게이트와 반대다.</b> {@link com.fitto.common.plan.PlanGuard}는
 * 사용 *전* 선차감하지만, 통화 시간은 끝나기 전엔 얼마나 쓸지 알 수 없다 —
 * {@link #requireCapacity} 는 <b>새 통화를 시작할 때만</b> 이미 다 썼는지 확인하고,
 * 진행 중인 통화는 한도를 넘겨도 끊지 않는다. 실제 사용량은 통화가 끝난 뒤
 * {@link #record} 로 누적한다.
 */
@Component
public class CallMinuteGuard {

    private static final Logger log = LoggerFactory.getLogger(CallMinuteGuard.class);

    /** FREE 커플 월 상한(분) — 실사용 분포 측정 전 자리표시자(Feature.java 상단 주석과 같은 원칙). */
    private static final long FREE_MONTHLY_LIMIT_SEC = 15L * 60 * 60;
    /** PRO 커플 월 상한(분) */
    private static final long PRO_MONTHLY_LIMIT_SEC = 60L * 60 * 60;

    private final PlanResolver planResolver;
    private final ObjectProvider<StringRedisTemplate> redisProvider;

    /** Redis 미가용 시 폴백(UsageCounter 와 같은 패턴) — 월이 바뀌면 통째로 비운다. */
    private final Map<String, AtomicLong> fallback = new ConcurrentHashMap<>();
    private volatile LocalDate fallbackMonth = KstClock.today();

    public CallMinuteGuard(PlanResolver planResolver, ObjectProvider<StringRedisTemplate> redisProvider) {
        this.planResolver = planResolver;
        this.redisProvider = redisProvider;
    }

    /** 통화 시작 전 확인 — 이번 달 이미 한도를 다 쓴 커플은 새 통화를 못 연다. */
    public void requireCapacity(Long coupleId) {
        long limitSec = limitSecondsFor(coupleId);
        if (usedSeconds(coupleId) >= limitSec) {
            throw new BusinessException(ErrorCode.CALL_TIME_LIMIT_EXCEEDED);
        }
    }

    /** 통화 종료 후 실제 시간을 누적한다 — 한도를 넘기게 되어도 이미 끝난 통화는 그대로 인정한다. */
    public void record(Long coupleId, int durationSec) {
        if (durationSec <= 0) {
            return;
        }
        String key = key(coupleId);
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                Long total = redis.opsForValue().increment(key, durationSec);
                if (total != null && total == durationSec) {
                    // 키에 이미 연월이 들어 있으니 TTL 은 순전히 청소용이다(UsageCounter 와 동일 패턴).
                    redis.expire(key, Duration.ofDays(40));
                }
                return;
            } catch (Exception e) {
                log.debug("Redis 미가용 — 통화 시간 누적 인메모리 폴백: {}", e.getMessage());
            }
        }
        sweepFallbackIfMonthChanged();
        fallback.computeIfAbsent(key, k -> new AtomicLong()).addAndGet(durationSec);
    }

    private long usedSeconds(Long coupleId) {
        String key = key(coupleId);
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                String value = redis.opsForValue().get(key);
                return value == null ? 0 : Long.parseLong(value);
            } catch (Exception e) {
                log.debug("Redis 미가용 — 통화 시간 조회 인메모리 폴백: {}", e.getMessage());
            }
        }
        sweepFallbackIfMonthChanged();
        AtomicLong counter = fallback.get(key);
        return counter == null ? 0 : counter.get();
    }

    private long limitSecondsFor(Long coupleId) {
        Plan plan = planResolver.resolveForRelation(coupleId);
        return plan == Plan.PRO ? PRO_MONTHLY_LIMIT_SEC : FREE_MONTHLY_LIMIT_SEC;
    }

    private String key(Long coupleId) {
        LocalDate today = KstClock.today();
        return "fitto:call-seconds:%d-%02d:%d".formatted(today.getYear(), today.getMonthValue(), coupleId);
    }

    private void sweepFallbackIfMonthChanged() {
        LocalDate today = KstClock.today();
        if (today.getYear() != fallbackMonth.getYear() || today.getMonthValue() != fallbackMonth.getMonthValue()) {
            // Redis 가 없는 개발 환경 전용 폴백이라 정확도보다 메모리 누수 방지가 우선이다.
            fallback.clear();
            fallbackMonth = today;
        }
    }
}
