package com.fitto.notification.service;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 안드로이드 알림 채널 — 앱이 채널을 만든 기기에만 카테고리별 channelId 를 싣는다
 * (docs/chat-unread-badge_2026-10-08.md "채널 분리").
 *
 * <p>채널을 만들기 전 버전의 앱에 없는 channelId 를 보내면 알림이 안 뜰 수 있다(Expo 문서). 그래서 기준은
 * "앱이 등록하며 보낸 channelsVersion 이 있는가" 하나이고, 아래가 그 경계를 고정한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExpoPushChannelTest {

    /** 대화방이 없는 수신자 — 채팅 배지는 0 이 된다. 채널은 배지와 무관하게 고른다 */
    private static final Long RECIPIENT = 999_999L;

    @Autowired ExpoPushNotificationService pushService;
    @Autowired AuthService authService;
    @Autowired DeviceTokenRepository deviceTokenRepository;
    @Autowired MockMvc mockMvc;

    private static DeviceToken token(String value, Integer channelsVersion) {
        return DeviceToken.builder().userId(RECIPIENT).token(value).platform("android")
                .channelsVersion(channelsVersion).build();
    }

    private Map<String, Object> only(DeviceToken token, NotificationCategory category) {
        List<Map<String, Object>> messages =
                pushService.messagesFor(RECIPIENT, List.of(token), category, "t", "b", "feed");
        assertThat(messages).hasSize(1);
        return messages.get(0);
    }

    @Test
    void 채널_버전이_없는_기기엔_어떤_카테고리도_channelId_를_싣지_않는다() {
        DeviceToken legacy = token("ExponentPushToken[legacy]", null);

        for (NotificationCategory category : NotificationCategory.values()) {
            assertThat(only(legacy, category)).as(category.name()).doesNotContainKey("channelId");
        }
    }

    @Test
    void 채널_버전이_있는_기기엔_카테고리별_channelId_를_싣는다() {
        DeviceToken current = token("ExponentPushToken[current]", 1);

        // 앱의 채널 id(frontend/src/utils/notificationChannels.ts)와 같은 문자열이어야 한다
        assertThat(only(current, NotificationCategory.CHAT)).containsEntry("channelId", "chat");
        assertThat(only(current, NotificationCategory.ANNIVERSARY)).containsEntry("channelId", "anniversary");
        assertThat(only(current, NotificationCategory.PARTNER)).containsEntry("channelId", "partner");
        assertThat(only(current, NotificationCategory.REMINDER)).containsEntry("channelId", "reminder");
    }

    /** 한 사람이 업데이트한 폰과 안 한 태블릿을 같이 쓰면 — 기기마다 따로 고른다 */
    @Test
    void 한_사람의_기기가_섞여_있으면_기기마다_따로_고른다() {
        List<Map<String, Object>> messages = pushService.messagesFor(RECIPIENT,
                List.of(token("ExponentPushToken[new-phone]", 1), token("ExponentPushToken[old-tablet]", null)),
                NotificationCategory.PARTNER, "t", "b", "place/1");

        assertThat(messages.get(0)).containsEntry("to", "ExponentPushToken[new-phone]")
                .containsEntry("channelId", "partner");
        assertThat(messages.get(1)).containsEntry("to", "ExponentPushToken[old-tablet]")
                .doesNotContainKey("channelId");
    }

    /**
     * 등록 API 계약 — 채널을 만들기 전 앱은 필드 없이 보내고, 만든 앱은 버전을 싣는다.
     * 재등록은 마지막 값으로 덮는다: 업데이트를 되돌려 채널을 모르는 JS 가 다시 돌면 "채널 없음"으로 돌아간다.
     */
    @Test
    void 등록_요청의_channelsVersion_을_저장하고_재등록하면_덮어쓴다() throws Exception {
        TokenResponse me = authService.register(
                new RegisterRequest("push-channels@fitto.com", "password123", "U", null, null, true, true, false),
                "127.0.0.1");
        String auth = "Bearer " + me.accessToken();
        String tok = "ExponentPushToken[channels]";

        registerVia(auth, "{\"token\":\"" + tok + "\",\"platform\":\"android\"}");
        assertThat(stored(tok).getChannelsVersion()).isNull();

        registerVia(auth, "{\"token\":\"" + tok + "\",\"platform\":\"android\",\"channelsVersion\":1}");
        assertThat(stored(tok).getChannelsVersion()).isEqualTo(1);

        registerVia(auth, "{\"token\":\"" + tok + "\",\"platform\":\"android\"}");
        assertThat(stored(tok).getChannelsVersion()).isNull();
    }

    private void registerVia(String auth, String json) throws Exception {
        mockMvc.perform(post("/api/v1/notifications/token")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk());
    }

    private DeviceToken stored(String token) {
        return deviceTokenRepository.findByToken(token).orElseThrow();
    }
}
