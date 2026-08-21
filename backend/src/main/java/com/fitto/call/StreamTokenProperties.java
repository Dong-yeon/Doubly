package com.fitto.call;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Stream Video 설정 바인딩 — application.yml 의 fitto.stream.*
 *
 * <p>통화 벨/웨이크업 스파이크(claude/call-spike-android)에서 검증한 구성을 그대로
 * 본 구현으로 승격했다. PLAN.md "통화·영상통화" 스펙 참고.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.stream")
public class StreamTokenProperties {

    /** Stream 대시보드의 API Key — 클라이언트에도 노출되는 값(비밀 아님). */
    private String apiKey = "";

    /** Stream 대시보드의 API Secret — 토큰 서명용, 절대 클라이언트에 내려가면 안 됨. */
    private String apiSecret = "";

    /** 토큰 유효기간(분). 만료되면 앱이 이 API 로 다시 발급받는다. */
    private int expireMinutes = 60;

    public boolean isConfigured() {
        return !apiKey.isBlank() && !apiSecret.isBlank();
    }
}
