package com.fitto.common.notification;

import java.util.Map;

/**
 * 푸시 알림 서비스 — 설계서 6.1 (Expo Push / FCM).
 */
public interface NotificationService {

    /** 기본 카테고리(PARTNER_ACTIVITY)로, 딥링크 데이터 없이 발송 — 상대 활동 알림 대부분이 여기 해당한다. */
    default void notify(Long recipientUserId, String title, String body) {
        notify(recipientUserId, NotificationCategory.PARTNER_ACTIVITY, title, body);
    }

    /** 카테고리를 명시해 발송(딥링크 데이터 없이). */
    default void notify(Long recipientUserId, NotificationCategory category, String title, String body) {
        notify(recipientUserId, category, title, body, Map.of());
    }

    /** 기본 카테고리(PARTNER_ACTIVITY)로 딥링크 데이터까지 실어 발송 — 상대 활동 알림 대부분이 이 형태를 쓴다. */
    default void notify(Long recipientUserId, String title, String body, Map<String, String> data) {
        notify(recipientUserId, NotificationCategory.PARTNER_ACTIVITY, title, body, data);
    }

    /**
     * 카테고리 + 딥링크 데이터(탭 시 이동할 화면 정보)까지 실어 발송.
     * data 는 예: {"type": "chat", "id": "42"} — 프론트 pushDeepLink.ts 가 type 으로 화면을 고르고
     * id 를 그 화면의 파라미터로 넘긴다.
     */
    void notify(Long recipientUserId, NotificationCategory category, String title, String body, Map<String, String> data);
}
