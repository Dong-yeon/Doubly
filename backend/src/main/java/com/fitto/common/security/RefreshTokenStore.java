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
 *
 * <p><b>응답 유실 복구.</b> 갱신 요청이 서버에 닿아 회전은 됐는데 응답이 클라이언트에 못 돌아가는
 * 일이 있다(iOS 가 백그라운드 앱을 그 사이에 죽이거나, 네트워크가 끊기거나). 그러면 클라이언트는
 * 옛 토큰을 그대로 들고 있다가 다음 실행에서 다시 보내고, 이를 무조건 재사용 공격으로 보면
 * <b>정상 사용자가 모든 기기에서 로그아웃</b>된다(2026-09-10 운영 로그 "재사용 감지 — 전체 세션
 * 폐기" 가 이 경우였다). 그래서 회전할 때 "옛 jti → 새 jti" 를 기록해 두고, 옛 토큰이 다시 오면
 * <b>새 토큰이 아직 한 번도 안 쓰였을 때만</b> 응답 유실로 보고 받아준다(새 토큰은 폐기하고 또
 * 새로 발급). 새 토큰이 이미 쓰였다면 두 주체가 한 토큰 계보를 나눠 쓰는 것이므로 진짜 재사용이다.
 * 시간 창이 아니라 계보로 판정하므로 며칠 뒤에 다시 켜도 복구되고, 탈취범이 먼저 썼다면 정상
 * 사용자의 다음 갱신에서 걸려 전체 폐기된다.
 * Redis 장애 시에는 가용성을 위해 허용(fail-open)하되 에러 로그를 남긴다 —
 * 회전·재사용 탐지가 일시 중단될 뿐 서명/만료 검증은 그대로 동작한다.
 */
@Component
public class RefreshTokenStore {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenStore.class);

    private static final String TOKEN_KEY_PREFIX = "auth:refresh:";
    private static final String SESSIONS_KEY_PREFIX = "auth:sessions:";
    /** 회전 계보 — 옛 jti 가 어떤 새 jti 로 교체됐는지. 응답 유실 판정에만 쓴다. */
    private static final String SUCCESSOR_KEY_PREFIX = "auth:refresh:next:";

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
            if (stored != null && stored.equals(String.valueOf(userId))) {
                redis.opsForSet().remove(sessionsKey(userId), jti);
                return ConsumeResult.VALID;
            }
            return recoverLostRotation(userId, jti);
        } catch (DataAccessException e) {
            log.error("리프레시 토큰 검증 실패(Redis) — 서명/만료 검증만으로 통과시킵니다: {}", e.getMessage());
            return ConsumeResult.UNAVAILABLE;
        }
    }

    /**
     * 이미 소비된 jti 가 다시 왔을 때 — 응답 유실인지 진짜 재사용인지 계보로 가른다(클래스 주석).
     * 응답 유실이면 아직 안 쓰인 후속 토큰을 폐기하고 VALID 를 돌려 호출부가 새로 발급하게 한다.
     * 계보 키는 GETDEL 이라 같은 옛 토큰이 세 번째로 오면 그때는 REUSED 다.
     */
    private ConsumeResult recoverLostRotation(Long userId, String jti) {
        String successor = redis.opsForValue().getAndDelete(successorKey(jti));
        if (successor == null) {
            return ConsumeResult.REUSED;
        }
        String successorOwner = redis.opsForValue().getAndDelete(tokenKey(successor));
        if (successorOwner == null || !successorOwner.equals(String.valueOf(userId))) {
            // 후속 토큰이 이미 쓰였다 = 옛 토큰과 새 토큰을 서로 다른 주체가 들고 있다
            return ConsumeResult.REUSED;
        }
        redis.opsForSet().remove(sessionsKey(userId), successor);
        log.info("리프레시 응답 유실 복구 — 안 쓰인 후속 토큰을 폐기하고 재발급: userId={}", userId);
        return ConsumeResult.VALID;
    }

    /** 회전 계보 기록 — 옛 jti 가 이 새 jti 로 교체됐다. 수명은 리프레시 토큰과 같다. */
    public void markRotated(String previousJti, String newJti, Duration ttl) {
        try {
            redis.opsForValue().set(successorKey(previousJti), newJti, ttl);
        } catch (DataAccessException e) {
            log.error("리프레시 회전 계보 기록 실패(Redis) — 응답 유실 시 복구되지 않습니다: {}", e.getMessage());
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

    private String successorKey(String jti) {
        return SUCCESSOR_KEY_PREFIX + jti;
    }
}
