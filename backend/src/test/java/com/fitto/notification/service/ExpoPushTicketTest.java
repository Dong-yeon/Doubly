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

import java.util.List;

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
