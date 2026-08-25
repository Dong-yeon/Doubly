package com.fitto.common.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

/**
 * Resend HTTP API 발송 — POST https://api.resend.com/emails.
 *
 * <p>Railway 같은 PaaS 는 아웃바운드 SMTP(587)를 막아 Gmail SMTP 가 닿지 못한다.
 * Resend 는 HTTPS(443)로 발송하므로 그 제약을 받지 않는다.
 *
 * <p>발송 실패는 호출자에게 던지지 않는다 — 응답 성공/실패로 계정 존재 여부가 드러나면 안 된다.
 */
public class ResendMailSender implements PasswordResetMailSender {

    private static final Logger log = LoggerFactory.getLogger(ResendMailSender.class);
    private static final String SEND_URL = "https://api.resend.com/emails";

    private final RestClient restClient;
    private final String apiKey;
    private final String from;

    public ResendMailSender(ResendProperties properties) {
        this.apiKey = properties.getApiKey();
        this.from = properties.getFrom();
        // SMTP 무한 멈춤과 같은 실수를 피하려 HTTP 타임아웃을 명시한다
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public void sendResetCode(String toEmail, String name, String code, Duration validFor) {
        Map<String, Object> body = Map.of(
                "from", from,
                "to", toEmail,
                "subject", "[Dubly] 비밀번호 재설정 인증코드",
                "text", buildText(name, code, validFor));
        try {
            restClient.post()
                    .uri(SEND_URL)
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            // 계정 존재 여부 비노출 — 실패는 로깅만 하고 삼킨다
            log.error("비밀번호 재설정 메일 발송 실패(Resend): {}", e.getMessage());
        }
    }

    private String buildText(String name, String code, Duration validFor) {
        return """
                %s님, 안녕하세요.

                비밀번호 재설정 인증코드는 아래 6자리입니다.

                    %s

                앱의 인증코드 입력 화면에 %d분 안에 입력해주세요.

                본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
                비밀번호는 변경되지 않으며, 코드만으로는 계정에 접근할 수 없습니다.

                — Dubly
                """.formatted(name, code, validFor.toMinutes());
    }
}
