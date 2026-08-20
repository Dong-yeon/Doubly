package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.user.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 인앱결제 완료 직후 즉시 검증({@code POST /plan/purchases/google}) — 클라이언트가
 * 스토어 웹훅(RTDN)을 기다리지 않고 PRO를 바로 받을 수 있는지 확인한다.
 * 실제 동기화 로직은 {@link GooglePlaySubscriptionSyncServiceTest}가 이미 커버하므로
 * 여기서는 트리거 경로(인증·입력검증·응답)만 본다.
 */
@SpringBootTest(properties = "fitto.plan.free-trial=false")
@ActiveProfiles("test")
class GooglePlayPurchaseVerificationTest {

    @Autowired
    AuthService authService;
    @Autowired
    PlanController planController;
    @MockitoBean
    GooglePlaySubscriptionSyncService syncService;

    private AuthUser register(String email) {
        Long userId = authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1")
                .user().id();
        return new AuthUser(userId, Role.USER);
    }

    @Test
    void purchaseToken이_비어있으면_거부한다() {
        AuthUser user = register("verify-blank@fitto.com");

        assertThatThrownBy(() -> planController.verifyGooglePurchase(user, new GooglePurchaseVerifyRequest(" ")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verify(syncService, never()).sync(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void purchaseToken을_받으면_동기화하고_최신_플랜을_돌려준다() {
        AuthUser user = register("verify-ok@fitto.com");

        ApiResponse<PlanResponse> response =
                planController.verifyGooglePurchase(user, new GooglePurchaseVerifyRequest("token-abc"));

        verify(syncService).sync("token-abc");
        assertThat(response.success()).isTrue();
        // 동기화는 모킹돼 있어 실제로 PRO 로 바뀌진 않는다 — 여기서는 트리거·응답 형태만 본다.
        assertThat(response.data().plan()).isEqualTo(Plan.FREE);
    }
}
