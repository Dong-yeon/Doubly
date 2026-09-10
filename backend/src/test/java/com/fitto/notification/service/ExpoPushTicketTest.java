package com.fitto.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Expo 발송 티켓 처리 — "알림이 안 온다"를 서버가 설명할 수 있게 하는 부분 (2026-09-08).
 *
 * <p>Expo 는 개별 메시지가 실패해도 HTTP 200 을 주고 사유를 본문에만 담는다. 예전에는
 * 응답을 {@code toBodilessEntity()} 로 버려서 토큰이 죽어도 로그에 아무것도 남지 않았고,
 * 죽은 토큰이 계정에 영원히 쌓였다. 아래 두 가지가 그 재발을 막는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ExpoPushTicketTest {

    @Autowired DeviceTokenService deviceTokenService;
    @Autowired DeviceTokenRepository deviceTokenRepository;
    @Autowired ExpoPushNotificationService pushService;
    @Autowired AuthService authService;
    @Autowired ObjectMapper objectMapper;

    /**
     * 응답 파싱 계약 — 실패 사유는 {@code data[i].details.error} 에 있다.
     * 이 경로가 어긋나면 거절을 전부 놓치므로(그래도 200 이라 조용하다) 여기서 고정한다.
     */
    @Test
    void 실패_사유를_details_error_에서_읽는다() throws Exception {
        String body = """
                {"data":[
                  {"status":"ok","id":"XXXX-XXXX"},
                  {"status":"error","message":"\\"ExponentPushToken[dead]\\" is not a registered push notification recipient",
                   "details":{"error":"DeviceNotRegistered"}}
                ]}""";

        var response = objectMapper.readValue(body, ExpoPushNotificationService.ExpoPushResponse.class);

        assertThat(response.data()).hasSize(2);
        assertThat(response.data().get(0).status()).isEqualTo("ok");
        assertThat(response.data().get(1).status()).isEqualTo("error");
        assertThat(response.data().get(1).details().error()).isEqualTo("DeviceNotRegistered");
    }

    /** 성공 응답에는 details 가 없다 — null 로 들어와도 터지지 않아야 한다. */
    @Test
    void 성공_티켓은_details_가_없다() throws Exception {
        var response = objectMapper.readValue(
                "{\"data\":[{\"status\":\"ok\",\"id\":\"YYYY\"}]}",
                ExpoPushNotificationService.ExpoPushResponse.class);

        assertThat(response.data().get(0).details()).isNull();
    }

    /**
     * 영수증 응답 계약 — 티켓과 달리 배열이 아니라 <b>티켓 id 를 키로 하는 map</b> 이고, 아직 처리
     * 안 된 id 는 빠져서 온다. 티켓 {@code ok} 뒤의 APNs 실패(InvalidCredentials 등)는 여기서만
     * 보이므로(2026-09-10) 이 경로가 어긋나면 iOS 키 문제를 영영 못 본다.
     */
    @Test
    void 영수증은_티켓_id_를_키로_하는_map_이다() throws Exception {
        String body = """
                {"data":{
                  "AAAA":{"status":"ok"},
                  "BBBB":{"status":"error","message":"The Apple Push Notification service key is invalid",
                          "details":{"error":"InvalidCredentials"}}
                }}""";

        var response = objectMapper.readValue(body, ExpoPushNotificationService.ExpoReceiptResponse.class);

        assertThat(response.data()).containsOnlyKeys("AAAA", "BBBB");
        assertThat(response.data().get("AAAA").status()).isEqualTo("ok");
        assertThat(response.data().get("BBBB").details().error()).isEqualTo("InvalidCredentials");
    }

    /** 영수증에서 DeviceNotRegistered 로 판정된 토큰만 지운다. 설정 문제(InvalidCredentials)는 지우지 않는다. */
    @Test
    void 영수증의_기기_미등록_토큰만_지운다() throws Exception {
        Long userId = authService.register(
                        new RegisterRequest("push-receipt@fitto.com", "password123", "테스터",
                                null, null, true, true, false), "127.0.0.1")
                .user().id();
        deviceTokenService.register(userId, "ExponentPushToken[receipt-alive]", "ios");
        deviceTokenService.register(userId, "ExponentPushToken[receipt-dead]", "android");
        deviceTokenService.register(userId, "ExponentPushToken[receipt-badkey]", "ios");
        Map<String, DeviceToken> accepted = new LinkedHashMap<>();
        for (DeviceToken t : deviceTokenRepository.findByUserId(userId)) {
            accepted.put("ticket-" + t.getToken(), t);
        }
        var response = objectMapper.readValue("""
                {"data":{
                  "ticket-ExponentPushToken[receipt-alive]":{"status":"ok"},
                  "ticket-ExponentPushToken[receipt-dead]":{"status":"error","details":{"error":"DeviceNotRegistered"}},
                  "ticket-ExponentPushToken[receipt-badkey]":{"status":"error","details":{"error":"InvalidCredentials"}}
                }}""", ExpoPushNotificationService.ExpoReceiptResponse.class);

        pushService.handleReceipts(userId, accepted, response);

        assertThat(deviceTokenRepository.findByUserId(userId))
                .extracting(DeviceToken::getToken)
                .containsExactlyInAnyOrder("ExponentPushToken[receipt-alive]", "ExponentPushToken[receipt-badkey]");
    }

    /** DeviceNotRegistered 로 판정된 토큰만 지우고, 같은 사용자의 살아있는 토큰은 남긴다. */
    @Test
    void 죽은_토큰만_지운다() {
        // device_tokens.user_id 에 FK 가 있어 실제 사용자가 필요하다
        Long userId = authService.register(
                        new RegisterRequest("push-ticket@fitto.com", "password123", "테스터",
                                null, null, true, true, false), "127.0.0.1")
                .user().id();
        deviceTokenService.register(userId, "ExponentPushToken[alive]", "ios");
        deviceTokenService.register(userId, "ExponentPushToken[dead]", "ios");
        assertThat(deviceTokenRepository.findByUserId(userId)).hasSize(2);

        deviceTokenService.removeDeadTokens(List.of("ExponentPushToken[dead]"));

        assertThat(deviceTokenRepository.findByUserId(userId))
                .extracting(DeviceToken::getToken)
                .containsExactly("ExponentPushToken[alive]");
    }
}
