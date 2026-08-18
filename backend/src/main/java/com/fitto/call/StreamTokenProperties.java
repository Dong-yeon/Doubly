package com.fitto.call;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Stream Video 설정 바인딩 — application.yml 의 fitto.stream.*
 *
 * <p><b>스파이크 전용.</b> 통화·영상통화 벨/웨이크업이 실제로 되는지 검증하는 동안만
 * 쓴다(별도 브랜치 claude/call-spike-android). PLAN.md "통화·영상통화" 스펙 참고.
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

    /** 토큰 유효기간(분). 스파이크 동안은 넉넉하게 잡는다. */
    private int expireMinutes = 60;

    public boolean isConfigured() {
        return !apiKey.isBlank() && !apiSecret.isBlank();
    }
}
