package com.fitto.common.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GooglePlayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Base64;

/**
 * Google Play 구독 웹훅(RTDN, Real-time Developer Notifications) 수신.
 *
 * <p>Play Console에 등록한 Pub/Sub 푸시 구독이 이 URL로 POST 한다. 사용자 JWT가 없는
 * 서버-서버 호출이라 {@link com.fitto.common.config.SecurityConfig}에서 인증 없이 열어두는
 * 대신, 쿼리 파라미터의 공유 비밀 토큰({@code ?token=})으로 발신자를 확인한다 — Google의
 * OIDC 서명 검증보다 단순하지만, 스토어 심사 전(계정도 아직 없는) 단계에서 먼저 엔드포인트를
 * 만들고 테스트할 수 있다는 이점이 있다.
 *
 * <p>알림 자체는 상태를 담고 있지 않으므로, 실제 판정은 항상
 * {@link GooglePlaySubscriptionSyncService}가 Play Developer API를 다시 불러 확정한다 —
 * 이 컨트롤러는 수신·인증·파싱만 담당한다.
 */
@RestController
@RequestMapping("/api/v1/webhooks/google-play")
public class GooglePlayWebhookController {

    private static final Logger log = LoggerFactory.getLogger(GooglePlayWebhookController.class);

    private final GooglePlayProperties properties;
    private final GooglePlaySubscriptionSyncService syncService;
    private final ObjectMapper objectMapper;

    public GooglePlayWebhookController(GooglePlayProperties properties,
                                        GooglePlaySubscriptionSyncService syncService,
                                        ObjectMapper objectMapper) {
        this.properties = properties;
        this.syncService = syncService;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    public ResponseEntity<Void> receive(@RequestParam(value = "token", required = false) String token,
                                         @RequestBody(required = false) GooglePlayPubSubEnvelope envelope) {
        if (properties.getWebhookToken().isBlank() || !properties.getWebhookToken().equals(token)) {
            log.warn("Play 웹훅 토큰 불일치 — 요청 거부");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        GooglePlayDeveloperNotification notification = decode(envelope);
        String purchaseToken = notification == null || notification.subscriptionNotification() == null
                ? null
                : notification.subscriptionNotification().purchaseToken();

        if (purchaseToken == null) {
            // testNotification 이거나 파싱에 실패한 payload — Pub/Sub가 재전송을 반복하지
            // 않도록 200으로 확인 응답만 하고 끝낸다(재시도로 풀릴 문제가 아니다).
            return ResponseEntity.ok().build();
        }

        syncService.sync(purchaseToken);
        return ResponseEntity.ok().build();
    }

    private GooglePlayDeveloperNotification decode(GooglePlayPubSubEnvelope envelope) {
        if (envelope == null || envelope.message() == null || envelope.message().data() == null) {
            return null;
        }
        try {
            byte[] json = Base64.getDecoder().decode(envelope.message().data());
            return objectMapper.readValue(json, GooglePlayDeveloperNotification.class);
        } catch (Exception e) {
            log.warn("Play 웹훅 payload 파싱 실패: {}", e.getMessage());
            return null;
        }
    }
}
