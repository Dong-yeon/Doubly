package com.fitto.common.plan;

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
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 기간별 사용량 카운터 — "이번 달 사진 몇 장", "오늘 AI 몇 번".
 *
 * <p>Redis {@code INCR} 이 기본이라 재배포·다중 인스턴스에서도 유지된다. Redis 가 없으면
 * (로컬 개발·테스트) 인메모리로 폴백한다 — 남용 방지 목적으로는 충분하고, 이것 때문에
 * 개발 환경에 Redis 를 강제하지 않는다.
 *
 * <p>원래 {@code GeminiClient} 안에 있던 로직을 꺼낸 것이다. AI 말고도 셀 것(사진 업로드
 * 등)이 생겼는데, 카운터가 AI 클라이언트 안에 숨어 있으면 재사용할 수가 없다.
 */
@Component
public class UsageCounter {

    private static final Logger log = LoggerFactory.getLogger(UsageCounter.class);

    private final ObjectProvider<StringRedisTemplate> redisProvider;

    /** Redis 미가용 시 폴백. 날짜가 바뀌면 통째로 비워 무한 증가를 막는다. */
    private final Map<String, AtomicInteger> fallback = new ConcurrentHashMap<>();
    private volatile LocalDate fallbackDate = KstClock.today();

    public UsageCounter(ObjectProvider<StringRedisTemplate> redisProvider) {
        this.redisProvider = redisProvider;
    }

    /** 한도의 "오늘"(KST) — {@link KstClock} 참고. 다른 서비스가 계속 참조하던 진입점이라 남겨둔다. */
    public static LocalDate today() {
        return KstClock.today();
    }

    /** 1 증가시키고 <b>증가 후</b> 값을 돌려준다. (첫 사용이면 1) */
    public int increment(Long userId, Feature feature, Quota quota) {
        String key = key(userId, feature, quota);
        Integer viaRedis = incrementInRedis(key, quota);
        return viaRedis != null ? viaRedis : incrementInMemory(key);
    }

    /** 증가 없이 현재 사용량만 읽는다 — 잔여 횟수 표시용. */
    public int peek(Long userId, Feature feature, Quota quota) {
        String key = key(userId, feature, quota);
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                String value = redis.opsForValue().get(key);
                return value == null ? 0 : Integer.parseInt(value);
            } catch (Exception e) {
                log.debug("Redis 미가용 — 사용량 조회 인메모리 폴백: {}", e.getMessage());
            }
        }
        sweepFallbackIfDateChanged();
        AtomicInteger counter = fallback.get(key);
        return counter == null ? 0 : counter.get();
    }

    private String key(Long userId, Feature feature, Quota quota) {
        return "fitto:usage:" + feature.name() + ":" + quota.windowKey(today()) + ":" + userId;
    }

    private Integer incrementInRedis(String key, Quota quota) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return null;
        }
        try {
            Long value = redis.opsForValue().increment(key);
            if (value != null && value == 1L) {
                // 기간 식별자가 키에 들어 있으므로 TTL 은 순전히 청소용이다.
                redis.expire(key, retention(quota));
            }
            return value == null ? null : value.intValue();
        } catch (Exception e) {
            log.debug("Redis 미가용 — 사용량 카운터 인메모리 폴백: {}", e.getMessage());
            return null;
        }
    }

    private static Duration retention(Quota quota) {
        return switch (quota.window()) {
            case DAY -> Duration.ofDays(2);
            case WEEK -> Duration.ofDays(15);
            case MONTH -> Duration.ofDays(70);
            case TOTAL, NONE -> Duration.ofDays(2);
        };
    }

    private int incrementInMemory(String key) {
        sweepFallbackIfDateChanged();
        return fallback.computeIfAbsent(key, k -> new AtomicInteger()).incrementAndGet();
    }

    private void sweepFallbackIfDateChanged() {
        LocalDate today = today();
        if (!today.equals(fallbackDate)) {
            // 월/주 카운터까지 같이 날아가지만, 폴백은 Redis 가 없는 개발 환경 전용이라
            // 정확도보다 메모리 누수 방지가 우선이다.
            fallback.clear();
            fallbackDate = today;
        }
    }
}
