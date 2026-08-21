package com.fitto.call;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;

/**
 * Stream Video 사용자 토큰 발급 — PLAN.md "통화·영상통화" 참고.
 *
 * <p>Stream 서버 SDK 없이 <b>HS256 JWT를 직접 서명</b>한다. Stream 토큰은 표준 JWT라
 * {@code user_id} 클레임 하나만 있으면 되고, 이미 있는 jjwt 의존성({@link com.fitto.common.security.JwtTokenProvider}
 * 와 같은 라이브러리)으로 충분해 새 의존성이 필요 없다.
 *
 * <p>이 토큰은 <b>절대 API Secret 을 포함하지 않는다</b> — 앱은 이 토큰만 받고,
 * Secret 은 항상 서버에만 있다.
 */
@Service
public class StreamTokenService {

    private final StreamTokenProperties properties;

    public StreamTokenService(StreamTokenProperties properties) {
        this.properties = properties;
    }

    public boolean isConfigured() {
        return properties.isConfigured();
    }

    /** Stream user_id 로는 Doubly 내부 userId 를 그대로 쓴다 — 두 시스템의 사용자 식별자를 맞춰둔다. */
    public String createToken(Long userId) {
        SecretKey key = Keys.hmacShaKeyFor(properties.getApiSecret().getBytes(StandardCharsets.UTF_8));
        Date now = new Date();
        long expireMillis = Duration.ofMinutes(properties.getExpireMinutes()).toMillis();
        return Jwts.builder()
                .claim("user_id", String.valueOf(userId))
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expireMillis))
                .signWith(key)
                .compact();
    }
}
