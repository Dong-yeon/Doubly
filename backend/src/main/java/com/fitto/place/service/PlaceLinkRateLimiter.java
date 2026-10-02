package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 링크 해석 레이트리밋 — 사용자당 10분에 20회(Redis 고정 윈도우).
 *
 * <p>해석 한 번이 외부 요청(카카오·네이버 페이지 최대 6 hop + 카카오 로컬 검색 1~2회)을 부른다.
 * 칩은 사람이 눌러야만 해석하므로 정상 사용은 한 자릿수다 — 상한은 서버를 프록시처럼 돌리는
 * 남용을 막는 용도다.
 *
 * <p>{@link com.fitto.common.security.AuthRateLimiter} 와 같은 방식(INCR + 첫 증가 때 TTL)이고,
 * Redis 가 죽으면 같은 이유로 허용한다(fail-open) — 칩이 안 되는 것이 서버가 막히는 것보다 낫다.
 */
@Component
public class PlaceLinkRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(PlaceLinkRateLimiter.class);

    static final int MAX_PER_WINDOW = 20;
    static final Duration WINDOW = Duration.ofMinutes(10);

    private final StringRedisTemplate redis;

    public PlaceLinkRateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void check(Long userId) {
        String key = "rl:place-link:" + userId;
        long count;
        try {
            Long value = redis.opsForValue().increment(key);
            if (value != null && value == 1L) {
                redis.expire(key, WINDOW);
            }
            count = value == null ? 0 : value;
        } catch (DataAccessException e) {
            log.error("링크 해석 레이트리밋 카운트 실패(Redis) — 이번 요청은 허용합니다: {}", e.getMessage());
            return;
        }
        if (count > MAX_PER_WINDOW) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS, "링크를 너무 자주 열었어요. 잠시 후 다시 시도해주세요.");
        }
    }
}
