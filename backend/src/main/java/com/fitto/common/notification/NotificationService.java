package com.fitto.common.notification;

/**
 * 푸시 알림 서비스 — 설계서 6.1 (Expo Push / FCM).
 */
public interface NotificationService {

    /**
     * 특정 사용자에게 푸시 알림 발송 (등록된 디바이스 토큰 전체).
     *
     * @param category 수신 거부 판정 단위 — 사용자가 이 분류를 껐으면 발송되지 않는다
     * @param link     알림을 탭했을 때 열 화면({@link PushLinks}). {@code null} 이면 앱만 열린다
     */
    void notify(Long recipientUserId, NotificationCategory category, String title, String body, String link);

    /** 열 화면이 딱히 없는 알림 — 탭하면 앱만 열린다. */
    default void notify(Long recipientUserId, NotificationCategory category, String title, String body) {
        notify(recipientUserId, category, title, body, null);
    }
}
