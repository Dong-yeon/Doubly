package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * CORS 설정 바인딩 — application.yml 의 fitto.cors.*
 * 개발 기본값은 "*"(모든 출처), 운영(prod 프로파일)은 CORS_ALLOWED_ORIGINS 환경변수
 * (쉼표 구분 도메인 목록)로 화이트리스트를 지정한다.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.cors")
public class CorsProperties {

    /**
     * 허용 Origin 패턴 목록. 비어 있으면 브라우저 교차 출처 요청을 모두 차단한다.
     * (네이티브 앱은 CORS 대상이 아니므로 영향 없음)
     */
    private List<String> allowedOrigins = List.of("*");

    /** 공백/빈 항목을 제거한 유효 패턴 목록. */
    public List<String> effectiveAllowedOrigins() {
        if (allowedOrigins == null) {
            return List.of();
        }
        return allowedOrigins.stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
