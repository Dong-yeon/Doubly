package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Google Play 구독(RTDN 웹훅 + Developer API) 설정 바인딩 — application.yml 의 fitto.google-play.*
 *
 * <p>패키지명은 안드로이드 릴리스 후에, 서비스 계정 키는 Play Console 의 "API 액세스"에서
 * 앱을 등록하고 서비스 계정에 "재무 데이터 보기" 권한을 준 뒤에야 발급된다 — 그 전까지는
 * 이 값들이 비어 있는 게 정상이고, 그동안 웹훅은 전부 403으로 거부된다
 * ({@link com.fitto.common.plan.GooglePlayWebhookController} 참고).
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.google-play")
public class GooglePlayProperties {

    /** 안드로이드 앱 패키지명 (예: com.fitto.app). */
    private String packageName = "";

    /**
     * Play Console 서비스 계정 키(JSON)를 base64 로 인코딩한 값.
     * JSON 파일을 그대로 환경변수에 넣으면 줄바꿈 때문에 깨지므로 base64 로 감싼다.
     */
    private String serviceAccountJsonBase64 = "";

    /**
     * 웹훅 URL 에 붙이는 공유 비밀 토큰(쿼리 파라미터 {@code token}).
     * Pub/Sub 푸시 구독을 등록할 때 이 값을 넣은 URL로 등록한다. Google의 OIDC 서명 검증
     * 대신 쓰는 단순한 발신자 확인 방식이다 — 스토어 심사 전, 계정도 없는 단계에서 먼저
     * 엔드포인트를 만들고 테스트할 수 있게 하기 위해서다.
     */
    private String webhookToken = "";

    public boolean isConfigured() {
        return packageName != null && !packageName.isBlank()
                && serviceAccountJsonBase64 != null && !serviceAccountJsonBase64.isBlank();
    }
}
