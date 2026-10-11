package com.fitto.notification.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.notification.domain.DeviceToken;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 푸시 payload 의 badge — iOS 는 이 값으로 아이콘 숫자를 <b>덮어쓴다</b>. 그래서 모를 때(채팅 외 알림)는
 * 0 이 아니라 필드 자체가 없어야 남아 있던 채팅 숫자가 지워지지 않는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ExpoPushBadgeTest {

    /** 대화방이 없는 수신자 — 안 읽은 채팅 0 */
    private static final Long RECIPIENT = 999_998L;

    @Autowired ExpoPushNotificationService pushService;

    @Test
    void 배지를_알면_싣는다() {
        Map<String, Object> m = ExpoPushNotificationService.message("tok", "t", "b", "chat/1", 3, null);
        assertThat(m).containsEntry("badge", 3);
    }

    @Test
    void 배지를_모르면_필드를_빼서_아이콘_숫자를_건드리지_않는다() {
        Map<String, Object> m = ExpoPushNotificationService.message("tok", "t", "b", "feed", null, null);
        assertThat(m).doesNotContainKey("badge");
    }

    /**
     * 발송 경로 그대로(messagesFor) — 채팅 외 카테고리에는 badge 가 없다. 안드로이드 채널을 나눠도(채널 버전이
     * 있는 기기) iOS 규칙은 그대로라는 것까지 같이 본다. 카테고리를 추가해도 이 루프가 새 카테고리를 덮는다.
     */
    @Test
    void 채팅_외_카테고리_푸시에는_badge_를_싣지_않는다() {
        List<DeviceToken> tokens = List.of(
                DeviceToken.builder().userId(RECIPIENT).token("ExponentPushToken[ios]").platform("ios").build(),
                DeviceToken.builder().userId(RECIPIENT).token("ExponentPushToken[android]").platform("android")
                        .channelsVersion(1).build());

        for (NotificationCategory category : NotificationCategory.values()) {
            if (category == NotificationCategory.CHAT) continue;
            pushService.messagesFor(RECIPIENT, tokens, category, "t", "b", "place/1")
                    .forEach(m -> assertThat(m).as(category.name()).doesNotContainKey("badge"));
        }
    }

    /** 채팅은 다 읽었어도(0) 싣는다 — 기준이 안 읽은 채팅 수라 0 도 "모름"이 아니라 정확한 값이다 */
    @Test
    void 채팅_푸시에는_안_읽은_수를_0_이라도_싣는다() {
        List<DeviceToken> tokens = List.of(
                DeviceToken.builder().userId(RECIPIENT).token("ExponentPushToken[ios]").platform("ios").build());

        assertThat(pushService.messagesFor(RECIPIENT, tokens, NotificationCategory.CHAT, "t", "b", "chat/1"))
                .singleElement()
                .satisfies(m -> assertThat(m).containsEntry("badge", 0));
    }
}
