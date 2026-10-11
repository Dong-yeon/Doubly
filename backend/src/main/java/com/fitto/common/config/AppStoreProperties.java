package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * App Store 구독(Server API + Server Notifications V2) 설정 — application.yml 의 fitto.app-store.*
 *
 * <p>{@link GooglePlayProperties} 와 같은 모양이다. 값이 비어 있으면 기능 전체가 조용히
 * 꺼지고 알림은 403 으로 거부된다 — 키는 App Store Connect 에서 앱을 만든 뒤에야 발급되므로
 * 그 전까지 비어 있는 게 정상이다.
 *
 * <p><b>키는 제출용 키와 다르다.</b> {@code eas.json} 의 {@code ascApiKeyPath} 는 앱 <b>제출</b>용
 * (App Store Connect API)이고, 여기 필요한 것은 <b>In-App Purchase</b> 키다
 * (App Store Connect → 사용자 및 액세스 → 통합 → 인앱 구입). 발급 화면이 다르고 권한도 다르다.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.app-store")
public class AppStoreProperties {

    /** App Store Connect 발급자 ID (UUID 꼴). */
    private String issuerId = "";

    /** In-App Purchase 키 ID — .p8 파일 이름에 들어 있는 10자리. */
    private String keyId = "";

    /**
     * In-App Purchase 키(.p8) 파일 전체를 base64 로 감싼 값.
     * PEM 은 줄바꿈이 있어 환경변수에 그대로 넣으면 깨진다({@link GooglePlayProperties} 와 같은 이유).
     */
    private String privateKeyBase64 = "";

    /** 앱 번들 ID — JWT 의 {@code bid} 클레임. 안드로이드 패키지명과 같은 값이다. */
    private String bundleId = "";

    /**
     * 알림 URL 에 붙이는 공유 비밀 토큰({@code ?token=}).
     * Apple 은 알림에 JWS 서명을 실어 보내지만, 우리는 그 내용을 <b>신뢰하지 않고</b>
     * 항상 Server API 를 다시 불러 확정한다({@code AppStoreSubscriptionSyncService}).
     * 그래서 여기서는 발신자 확인만 하면 되고, Google 쪽과 같은 방식을 쓴다.
     */
    private String notificationToken = "";

    /**
     * 어느 환경을 먼저 조회할지 — {@code auto} | {@code production} | {@code sandbox}.
     *
     * <p>기본 {@code auto} 는 프로덕션을 먼저 부르고 "거래를 찾을 수 없음"이면 샌드박스로
     * 한 번 더 시도한다(Apple 권장). 샌드박스 계정으로 테스트하는 동안에도 코드가 그대로 돈다.
     */
    private String environment = "auto";

    public boolean isConfigured() {
        return notBlank(issuerId) && notBlank(keyId) && notBlank(privateKeyBase64) && notBlank(bundleId);
    }

    private boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
