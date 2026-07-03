package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Gemini(음식 사진 AI 분석) 설정 바인딩 — application.yml 의 fitto.gemini.*
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.gemini")
public class GeminiProperties {

    /** Google AI Studio API 키. 비어 있으면 분석 기능 비활성. */
    private String apiKey = "";

    /** 사용할 모델. 무료 티어는 flash / flash-lite 계열만 지원. */
    private String model = "gemini-2.5-flash-lite";

    /** 사용자 1명당 하루 분석 허용 횟수 (무료 티어 RPD 방어) */
    private int dailyLimitPerUser = 10;

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
