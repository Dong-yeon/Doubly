package com.fitto.common.config;

import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * 운영 환경에서 안전하지 않은 JWT 시크릿 사용을 차단한다.
 * prod 프로파일에서 시크릿이 비어 있거나 dev 전용 값이면 부팅을 실패시킨다.
 */
@Component
public class JwtSecretGuard {

    /** 예시/개발용 시크릿을 식별하는 마커 — 하나라도 포함되면 운영 부팅 차단. */
    private static final String[] WEAK_MARKERS = {"dev-only", "change-me"};

    /** HS256 서명 키 최소 길이(바이트) — 이보다 짧으면 무차별 대입에 취약. */
    private static final int MIN_SECRET_LENGTH = 32;

    private final JwtProperties jwtProperties;
    private final Environment environment;

    public JwtSecretGuard(JwtProperties jwtProperties, Environment environment) {
        this.jwtProperties = jwtProperties;
        this.environment = environment;
    }

    @PostConstruct
    void validate() {
        boolean prod = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (!prod) {
            return;
        }
        String secret = jwtProperties.getSecret();
        boolean weak = secret == null || secret.isBlank()
                || secret.length() < MIN_SECRET_LENGTH
                || Arrays.stream(WEAK_MARKERS).anyMatch(secret::contains);
        if (weak) {
            throw new IllegalStateException(
                    "운영 환경에서는 JWT_SECRET 환경변수에 32자 이상의 안전한 무작위 시크릿을 "
                            + "반드시 설정해야 합니다 (예: openssl rand -hex 32).");
        }
    }
}
