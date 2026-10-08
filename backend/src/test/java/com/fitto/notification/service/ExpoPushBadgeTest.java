package com.fitto.notification.service;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 푸시 payload 의 badge — iOS 는 이 값으로 아이콘 숫자를 <b>덮어쓴다</b>. 그래서 모를 때(채팅 외 알림)는
 * 0 이 아니라 필드 자체가 없어야 남아 있던 채팅 숫자가 지워지지 않는다.
 */
class ExpoPushBadgeTest {

    @Test
    void 배지를_알면_싣는다() {
        Map<String, Object> m = ExpoPushNotificationService.message("tok", "t", "b", "chat/1", 3);
        assertThat(m).containsEntry("badge", 3);
    }

    @Test
    void 배지를_모르면_필드를_빼서_아이콘_숫자를_건드리지_않는다() {
        Map<String, Object> m = ExpoPushNotificationService.message("tok", "t", "b", "feed", null);
        assertThat(m).doesNotContainKey("badge");
    }
}
