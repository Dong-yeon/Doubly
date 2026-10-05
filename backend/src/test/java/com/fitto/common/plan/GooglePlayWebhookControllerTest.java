package com.fitto.common.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Google Play 웹훅 수신 — 발신자 확인(공유 토큰)과 payload 파싱만 검증한다.
 * 실제 구독 상태 판정 로직은 {@link GooglePlaySubscriptionSyncServiceTest}가 커버한다.
 */
@SpringBootTest(properties = "fitto.google-play.webhook-token=test-secret")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GooglePlayWebhookControllerTest {

    private static final String URL = "/api/v1/webhooks/google-play";

    @Autowired
    MockMvc mockMvc;
    @MockitoBean
    GooglePlaySubscriptionSyncService syncService;
    @MockitoBean
    FeatureCreditService creditService;

    @Test
    void 토큰이_없으면_403이고_동기화하지_않는다() throws Exception {
        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        verify(syncService, never()).sync(anyString());
    }

    @Test
    void 토큰이_틀리면_403() throws Exception {
        mockMvc.perform(post(URL + "?token=wrong")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void 테스트_알림은_200으로_확인만_하고_동기화하지_않는다() throws Exception {
        String data = encode("""
                { "packageName": "com.fitto.app", "testNotification": { "version": "1.0" } }
                """);

        mockMvc.perform(post(URL + "?token=test-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"message\": { \"data\": \"" + data + "\" } }"))
                .andExpect(status().isOk());
        verify(syncService, never()).sync(anyString());
    }

    @Test
    void 구독_알림을_받으면_purchaseToken으로_동기화한다() throws Exception {
        String data = encode("""
                {
                  "packageName": "com.fitto.app",
                  "subscriptionNotification": {
                    "notificationType": 4,
                    "purchaseToken": "test-purchase-token",
                    "subscriptionId": "pro.monthly"
                  }
                }
                """);

        mockMvc.perform(post(URL + "?token=test-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"message\": { \"data\": \"" + data + "\" } }"))
                .andExpect(status().isOk());
        verify(syncService).sync(eq("test-purchase-token"));
    }

    /** 일회성 상품(크레딧)의 무효 결제 알림 — 예전엔 읽지 않아 환불받은 사람이 크레딧을 그대로 썼다(§7-2). */
    @Test
    void 일회성_상품_무효_알림은_크레딧_회수로_보낸다() throws Exception {
        String data = encode("""
                {
                  "packageName": "com.fitto.app",
                  "voidedPurchaseNotification": {
                    "purchaseToken": "voided-token",
                    "orderId": "GPA.0000",
                    "productType": 2,
                    "refundType": 1
                  }
                }
                """);

        mockMvc.perform(post(URL + "?token=test-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"message\": { \"data\": \"" + data + "\" } }"))
                .andExpect(status().isOk());
        verify(creditService).revokeIfVoidedOnGooglePlay("voided-token");
        verify(syncService, never()).sync(anyString());
    }

    @Test
    void 구독_무효_알림은_구독_동기화로_보낸다() throws Exception {
        String data = encode("""
                {
                  "packageName": "com.fitto.app",
                  "voidedPurchaseNotification": { "purchaseToken": "voided-sub", "productType": 1, "refundType": 1 }
                }
                """);

        mockMvc.perform(post(URL + "?token=test-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"message\": { \"data\": \"" + data + "\" } }"))
                .andExpect(status().isOk());
        verify(syncService).sync("voided-sub");
        verify(creditService, never()).revokeIfVoidedOnGooglePlay(anyString());
    }

    private String encode(String json) {
        return Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}
