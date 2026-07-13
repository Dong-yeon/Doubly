package com.fitto.common.security;

import com.fitto.common.config.JwtProperties;
import com.fitto.user.domain.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;

/**
 * JWT 발급/검증 — 설계서 4.4 AUTH-05 (Access/Refresh).
 */
@Component
public class JwtTokenProvider {

    private static final String CLAIM_ROLE = "role";
    private static final String CLAIM_TYPE = "type";
    private static final String TYPE_ACCESS = "access";
    private static final String TYPE_REFRESH = "refresh";

    private final SecretKey key;
    private final long accessExpireMillis;
    private final long refreshExpireMillis;

    public JwtTokenProvider(JwtProperties props) {
        this.key = Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8));
        this.accessExpireMillis = Duration.ofMinutes(props.getAccessTokenExpireMinutes()).toMillis();
        this.refreshExpireMillis = Duration.ofDays(props.getRefreshTokenExpireDays()).toMillis();
    }

    public String createAccessToken(Long userId, Role role) {
        Date now = new Date();
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim(CLAIM_ROLE, role.name())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + accessExpireMillis))
                .signWith(key)
                .compact();
    }

    public String createRefreshToken(Long userId) {
        Date now = new Date();
        return Jwts.builder()
                // jti — 토큰 회전/무효화(RefreshTokenStore)의 식별자
                .id(java.util.UUID.randomUUID().toString())
                .subject(String.valueOf(userId))
                .claim(CLAIM_TYPE, TYPE_REFRESH)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + refreshExpireMillis))
                .signWith(key)
                .compact();
    }

    /** 리프레시 토큰 남은 유효기간(전체 기간 기준) — RefreshTokenStore TTL 용. */
    public java.time.Duration refreshTokenTtl() {
        return java.time.Duration.ofMillis(refreshExpireMillis);
    }

    /** 서명/만료 검증 후 Claims 반환. 실패 시 JwtException. */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    public boolean isValidAccessToken(String token) {
        try {
            return TYPE_ACCESS.equals(parse(token).get(CLAIM_TYPE, String.class));
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public boolean isRefreshToken(Claims claims) {
        return TYPE_REFRESH.equals(claims.get(CLAIM_TYPE, String.class));
    }

    public AuthUser toAuthUser(Claims claims) {
        Long userId = Long.valueOf(claims.getSubject());
        String roleName = claims.get(CLAIM_ROLE, String.class);
        Role role = roleName != null ? Role.valueOf(roleName) : Role.USER;
        return new AuthUser(userId, role);
    }
}
