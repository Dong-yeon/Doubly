package com.fitto.common.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Set;

/**
 * 리프레시 토큰 화이트리스트(Redis) — 회전(rotation)·무효화·재사용 탐지.
 * <ul>
 *   <li>발급 시 jti 를 저장, 갱신 시 소비(consume)하고 새 jti 로 교체한다.</li>
 *   <li>소비 시 저장소에 없으면 = 이미 쓰였거나 무효화된 토큰 → 재사용 공격 신호.</li>
 *   <li>로그아웃/탈퇴 시 해당 사용자 토큰을 폐기해 stateless JWT 의 "만료 전까지 유효" 문제를 막는다.</li>
 * </ul>
 * Redis 장애 시에는 가용성을 위해 허용(fail-open)하되 에러 로그를 남긴다 —
 * 회전·재사용 탐지가 일시 중단될 뿐 서명/만료 검증은 그대로 동작한다.
 */
@Component
public class RefreshTokenStore {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenStore.class);

    private static final String TOKEN_KEY_PREFIX = "auth:refresh:";
    private static final String SESSIONS_KEY_PREFIX = "auth:sessions:";

    /** consume 결과 — VALID: 정상 소비, REUSED: 재사용/무효화된 토큰, UNAVAILABLE: Redis 장애(fail-open) */
    public enum ConsumeResult { VALID, REUSED, UNAVAILABLE }

    private final StringRedisTemplate redis;

    public RefreshTokenStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 발급된 리프레시 토큰(jti)을 화이트리스트에 등록한다. */
    public void store(Long userId, String jti, Duration ttl) {
        try {
            redis.opsForValue().set(tokenKey(jti), String.valueOf(userId), ttl);
            String sessionsKey = sessionsKey(userId);
            redis.opsForSet().add(sessionsKey, jti);
            redis.expire(sessionsKey, ttl); // 마지막 발급 기준으로 세션 목록 수명 연장
        } catch (DataAccessException e) {
            log.error("리프레시 토큰 저장 실패(Redis) — 회전 보호 없이 발급됩니다: {}", e.getMessage());
        }
    }

    /**
     * 갱신 시 jti 를 원자적으로 소비한다(GETDEL).
     * 저장소에 없으면 이미 회전됐거나 무효화된 토큰의 재사용이다.
     */
    public ConsumeResult consume(Long userId, String jti) {
        try {
            String stored = redis.opsForValue().getAndDelete(tokenKey(jti));
            if (stored == null || !stored.equals(String.valueOf(userId))) {
                return ConsumeResult.REUSED;
            }
            redis.opsForSet().remove(sessionsKey(userId), jti);
            return ConsumeResult.VALID;
        } catch (DataAccessException e) {
            log.error("리프레시 토큰 검증 실패(Redis) — 서명/만료 검증만으로 통과시킵니다: {}", e.getMessage());
            return ConsumeResult.UNAVAILABLE;
        }
    }

    /** 단일 토큰 폐기 — 로그아웃. */
    public void revoke(Long userId, String jti) {
        try {
            redis.delete(tokenKey(jti));
            redis.opsForSet().remove(sessionsKey(userId), jti);
        } catch (DataAccessException e) {
            log.error("리프레시 토큰 폐기 실패(Redis): {}", e.getMessage());
        }
    }

    /** 사용자 전체 세션 폐기 — 재사용 탐지·회원 탈퇴 시. */
    public void revokeAll(Long userId) {
        try {
            String sessionsKey = sessionsKey(userId);
            Set<String> jtis = redis.opsForSet().members(sessionsKey);
            if (jtis != null) {
                for (String jti : jtis) {
                    redis.delete(tokenKey(jti));
                }
            }
            redis.delete(sessionsKey);
        } catch (DataAccessException e) {
            log.error("사용자 세션 전체 폐기 실패(Redis): userId={} {}", userId, e.getMessage());
        }
    }

    private String tokenKey(String jti) {
        return TOKEN_KEY_PREFIX + jti;
    }

    private String sessionsKey(Long userId) {
        return SESSIONS_KEY_PREFIX + userId;
    }
}
