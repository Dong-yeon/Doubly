package com.fitto.common.security;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;

/**
 * 인증 엔드포인트 레이트리밋(Redis 고정 윈도우) — 브루트포스/크리덴셜 스터핑/가입 스팸 방어.
 * <ul>
 *   <li>로그인: IP+이메일 기준 <b>실패</b> 횟수 카운트 — 15분 내 5회 실패 시 차단, 성공 시 리셋.
 *       (전체 시도가 아닌 실패만 세므로 정상 사용자를 잠그지 않는다)</li>
 *   <li>회원가입: IP 기준 시간당 10회.</li>
 *   <li>토큰 갱신: IP 기준 5분당 30회 — 정상 앱은 30분에 1회면 충분하다.</li>
 * </ul>
 * Redis 장애 시 가용성을 위해 허용(fail-open)하고 에러 로그를 남긴다.
 */
@Component
public class AuthRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(AuthRateLimiter.class);

    private static final int LOGIN_MAX_FAILURES = 5;
    private static final Duration LOGIN_WINDOW = Duration.ofMinutes(15);

    private static final int REGISTER_MAX = 10;
    private static final Duration REGISTER_WINDOW = Duration.ofHours(1);

    private static final int REFRESH_MAX = 30;
    private static final Duration REFRESH_WINDOW = Duration.ofMinutes(5);

    /** 코드 발송: 이메일 기준(메일 폭탄 방지) + IP 기준(대량 정찰 방지) 이중 한도 */
    private static final int FORGOT_EMAIL_MAX = 3;
    private static final Duration FORGOT_EMAIL_WINDOW = Duration.ofHours(1);
    private static final int FORGOT_IP_MAX = 10;
    private static final Duration FORGOT_IP_WINDOW = Duration.ofHours(1);

    /** 코드 검증: 이메일별 시도 한도(토큰 자체의 5회 제한을 코드 재발급으로 우회하는 것 차단) */
    private static final int RESET_MAX = 10;
    private static final Duration RESET_WINDOW = Duration.ofMinutes(15);

    private final StringRedisTemplate redis;

    public AuthRateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 로그인 시도 전 호출 — 실패 누적이 한도를 넘었으면 429. */
    public void checkLogin(String clientIp, String email) {
        if (currentCount(loginKey(clientIp, email)) >= LOGIN_MAX_FAILURES) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }
    }

    /** 로그인 실패 시 호출 — 실패 카운트 증가. */
    public void recordLoginFailure(String clientIp, String email) {
        increment(loginKey(clientIp, email), LOGIN_WINDOW);
    }

    /** 로그인 성공 시 호출 — 실패 카운트 리셋(정상 사용자 잠금 방지). */
    public void resetLogin(String clientIp, String email) {
        try {
            redis.delete(loginKey(clientIp, email));
        } catch (DataAccessException e) {
            log.error("로그인 실패 카운트 리셋 실패(Redis): {}", e.getMessage());
        }
    }

    /** 회원가입 — IP 기준 시간당 한도. */
    public void checkRegister(String clientIp) {
        if (increment("rl:register:" + clientIp, REGISTER_WINDOW) > REGISTER_MAX) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }
    }

    /** 토큰 갱신 — IP 기준 한도(탈취 토큰 무차별 시도 억제). */
    public void checkRefresh(String clientIp) {
        if (increment("rl:refresh:" + clientIp, REFRESH_WINDOW) > REFRESH_MAX) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }
    }

    /**
     * 비밀번호 재설정 코드 발송 — 이메일·IP 이중 한도.
     * 한도 초과는 예외를 던지지 않고 false 를 돌려준다. 여기서 429 를 내면 응답 차이로
     * 가입된 이메일을 골라낼 수 있기 때문이다 — 호출자는 조용히 발송만 건너뛴다.
     */
    public boolean allowForgotPassword(String clientIp, String email) {
        boolean emailOk = increment("rl:forgot:email:" + email.toLowerCase(Locale.ROOT),
                FORGOT_EMAIL_WINDOW) <= FORGOT_EMAIL_MAX;
        boolean ipOk = increment("rl:forgot:ip:" + clientIp, FORGOT_IP_WINDOW) <= FORGOT_IP_MAX;
        return emailOk && ipOk;
    }

    /** 비밀번호 재설정 코드 검증 시도 — 한도 초과 시 429. */
    public void checkResetPassword(String clientIp, String email) {
        if (increment("rl:reset:" + clientIp + ":" + email.toLowerCase(Locale.ROOT),
                RESET_WINDOW) > RESET_MAX) {
            throw new BusinessException(ErrorCode.TOO_MANY_REQUESTS);
        }
    }

    // ---- helpers ----

    private String loginKey(String clientIp, String email) {
        return "rl:login:" + clientIp + ":" + email.toLowerCase(Locale.ROOT);
    }

    /** INCR + 첫 증가 시 윈도우 TTL 설정. Redis 장애 시 0(허용) 반환. */
    private long increment(String key, Duration window) {
        try {
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redis.expire(key, window);
            }
            return count == null ? 0 : count;
        } catch (DataAccessException e) {
            log.error("레이트리밋 카운트 실패(Redis) — 이번 요청은 허용합니다: {}", e.getMessage());
            return 0;
        }
    }

    private long currentCount(String key) {
        try {
            String value = redis.opsForValue().get(key);
            return value == null ? 0 : Long.parseLong(value);
        } catch (DataAccessException | NumberFormatException e) {
            log.error("레이트리밋 조회 실패(Redis) — 이번 요청은 허용합니다: {}", e.getMessage());
            return 0;
        }
    }
}
