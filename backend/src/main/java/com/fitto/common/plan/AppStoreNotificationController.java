package com.fitto.common.plan;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.AppStoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * App Store Server Notifications V2 수신 — 갱신·해지·환불이 서버에 반영되는 경로.
 *
 * <p>{@link GooglePlayWebhookController} 와 같은 모양이다. 사용자 JWT 가 없는 서버-서버
 * 호출이라 {@link com.fitto.common.config.SecurityConfig} 에서 열어두는 대신 쿼리 파라미터의
 * 공유 비밀({@code ?token=})로 발신자를 확인한다.
 *
 * <p><b>알림 본문은 판정에 쓰지 않는다.</b> 거래 id 하나만 꺼내
 * {@link AppStoreSubscriptionSyncService} 가 Server API 로 되묻는다 — 그래서 JWS 서명을
 * 검증하지 않아도 가짜 알림으로 DB 를 바꿀 수 없다({@link AppStoreJws} 주석 참고).
 *
 * <p>애플은 2xx 가 아니면 재전송한다. 우리가 처리하지 못한 경우에도 <b>200 을 돌려주지 않는
 * 쪽</b>이 맞지만, 파싱 불가처럼 재전송해도 결과가 같은 것은 200 으로 닫아 무한 재시도를 막는다.
 */
@RestController
@RequestMapping("/api/v1/webhooks/app-store")
public class AppStoreNotificationController {

    private static final Logger log = LoggerFactory.getLogger(AppStoreNotificationController.class);

    private final AppStoreProperties properties;
    private final AppStoreSubscriptionSyncService syncService;
    private final ObjectMapper objectMapper;

    public AppStoreNotificationController(AppStoreProperties properties,
                                           AppStoreSubscriptionSyncService syncService,
                                           ObjectMapper objectMapper) {
        this.properties = properties;
        this.syncService = syncService;
        this.objectMapper = objectMapper;
    }

    /** 애플이 보내는 본문은 {@code {"signedPayload": "<JWS>"}} 하나뿐이다. */
    public record Envelope(String signedPayload) {
    }

    @PostMapping
    public ResponseEntity<Void> receive(@RequestParam(value = "token", required = false) String token,
                                         @RequestBody(required = false) Envelope envelope) {
        String expected = properties.getNotificationToken();
        if (expected == null || expected.isBlank() || !expected.equals(token)) {
            // 토큰 미설정(스토어 등록 전)도 거부다 — 열어두는 것보다 닫아두는 쪽이 안전하다.
            return ResponseEntity.status(403).build();
        }
        if (envelope == null || envelope.signedPayload() == null) {
            return ResponseEntity.ok().build();
        }

        String transactionId = transactionIdOf(envelope.signedPayload());
        if (transactionId == null) {
            // 구독과 무관한 알림(예: 테스트 알림)이거나 형식이 다르다. 재전송해도 같으므로 닫는다.
            log.info("App Store 알림에서 거래 id 를 찾지 못함 — 건너뜀");
            return ResponseEntity.ok().build();
        }
        syncService.sync(transactionId);
        return ResponseEntity.ok().build();
    }

    /** 알림 JWS → data.signedTransactionInfo JWS → transactionId. 하나라도 없으면 null. */
    private String transactionIdOf(String signedPayload) {
        JsonNode notification = AppStoreJws.payload(objectMapper, signedPayload);
        if (notification == null) {
            return null;
        }
        JsonNode transaction = AppStoreJws.payload(objectMapper,
                notification.path("data").path("signedTransactionInfo").asText(null));
        if (transaction == null) {
            return null;
        }
        // originalTransactionId 가 있으면 그걸 쓴다 — 어느 쪽이든 애플이 최신 상태를 돌려준다.
        String original = transaction.path("originalTransactionId").asText(null);
        return original != null ? original : transaction.path("transactionId").asText(null);
    }
}
