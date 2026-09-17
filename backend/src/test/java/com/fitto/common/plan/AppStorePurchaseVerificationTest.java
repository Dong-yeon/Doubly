package com.fitto.common.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.security.AuthUser;
import com.fitto.user.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 애플 결제 검증 트리거({@code POST /plan/purchases/apple})와 알림 수신
 * ({@code POST /webhooks/app-store}) — {@link GooglePlayPurchaseVerificationTest} 의 짝.
 *
 * <p>실제 상태 판정은 App Store Server API 를 부르는 일이라 여기서 하지 않는다. 대신
 * <b>애플 말을 듣기 전에 무엇이 걸러지는가</b>를 본다 — 입력 검증, 발신자 토큰, 그리고
 * "알림 본문을 판정에 쓰지 않는다"는 약속(거래 id 만 꺼내 sync 로 넘긴다).
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        "fitto.plan.trial-days=0",
        "fitto.app-store.notification-token=test-token"})
@ActiveProfiles("test")
class AppStorePurchaseVerificationTest {

    @Autowired
    AuthService authService;
    @Autowired
    PlanController planController;
    @Autowired
    AppStoreNotificationController notificationController;
    @Autowired
    ObjectMapper objectMapper;
    @MockitoBean
    AppStoreSubscriptionSyncService syncService;

    private AuthUser register(String email) {
        Long userId = authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1")
                .user().id();
        return new AuthUser(userId, Role.USER);
    }

    /** 서명 없는 JWS 흉내 — payload 만 읽으므로 헤더·서명 자리는 아무 값이어도 된다. */
    private String jws(String json) {
        return "eyJhbGciOiJFUzI1NiJ9." + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(json.getBytes(StandardCharsets.UTF_8)) + ".sig";
    }

    @Test
    void transactionId_가_비어있으면_거부한다() {
        AuthUser user = register("apple-blank@fitto.com");

        assertThatThrownBy(() -> planController.verifyApplePurchase(user, new ApplePurchaseVerifyRequest(" ")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verify(syncService, never()).sync(any());
    }

    @Test
    void transactionId_가_있으면_동기화를_태운다() {
        AuthUser user = register("apple-ok@fitto.com");

        planController.verifyApplePurchase(user, new ApplePurchaseVerifyRequest("2000000123456789"));

        verify(syncService).sync("2000000123456789");
    }

    @Test
    void 알림은_토큰이_틀리면_403_이고_동기화하지_않는다() {
        var body = new AppStoreNotificationController.Envelope(jws("{}"));

        assertThat(notificationController.receive("wrong", body).getStatusCode().value()).isEqualTo(403);
        assertThat(notificationController.receive(null, body).getStatusCode().value()).isEqualTo(403);
        verify(syncService, never()).sync(any());
    }

    @Test
    void 알림에서_거래id_만_꺼내_동기화로_넘긴다() {
        /*
         * 본문에는 상태(만료·해지 등)도 함께 오지만 우리는 쓰지 않는다 — 거래 id 로 애플에게
         * 다시 물어 확정한다. 그래서 가짜 알림이 와도 DB 가 바뀌지 않는다.
         */
        String transaction = jws("{\"originalTransactionId\":\"2000000999\",\"productId\":\"pro_monthly\"}");
        String payload = jws("{\"notificationType\":\"DID_RENEW\",\"data\":{\"signedTransactionInfo\":\""
                + transaction + "\"}}");

        var response = notificationController.receive("test-token",
                new AppStoreNotificationController.Envelope(payload));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(syncService).sync("2000000999");
    }

    @Test
    void 구독과_무관한_알림은_200_으로_닫고_넘어간다() {
        // 테스트 알림처럼 거래 정보가 없는 것들. 재전송해도 결과가 같으므로 200 으로 닫는다.
        var response = notificationController.receive("test-token",
                new AppStoreNotificationController.Envelope(jws("{\"notificationType\":\"TEST\"}")));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(syncService, never()).sync(any());
    }
}
