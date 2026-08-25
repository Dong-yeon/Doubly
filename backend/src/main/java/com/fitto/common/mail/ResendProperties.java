package com.fitto.common.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Resend 메일 발송 설정 — fitto.resend.*
 *
 * <p>Railway 같은 PaaS 는 아웃바운드 SMTP(587)를 막는 경우가 많아 Gmail SMTP 가 닿지 않는다.
 * Resend 는 HTTPS(443)로 발송하므로 그 제약을 받지 않는다.
 */
@Component
@ConfigurationProperties(prefix = "fitto.resend")
public class ResendProperties {

    /** Resend API 키 (re_...). 비어 있으면 Resend 발송을 비활성화한다. */
    private String apiKey = "";

    /**
     * 발신자 — "이름 &lt;주소&gt;" 형식.
     * 도메인 인증 전에는 onboarding@resend.dev 로만 보낼 수 있고, 이 경우 수신자는
     * Resend 가입 계정 이메일로 제한된다. 실제 사용자에게 보내려면 도메인 인증이 필요하다.
     */
    private String from = "Dubly <onboarding@resend.dev>";

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = from;
    }
}
