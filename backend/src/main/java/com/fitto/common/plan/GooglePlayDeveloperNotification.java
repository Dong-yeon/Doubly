package com.fitto.common.plan;

/**
 * RTDN(Real-time Developer Notifications) 본문 — {@link GooglePlayPubSubEnvelope#message()}의
 * {@code data}를 base64 디코드한 JSON.
 *
 * <p><b>이 알림 자체에는 상태가 없다.</b> "이 purchaseToken 관련해서 뭔가 바뀌었다"는
 * 신호와 상품 식별자뿐이고, 지금 활성인지/언제 만료되는지는 담겨 있지 않다. 그래서
 * {@link GooglePlaySubscriptionSyncService} 는 알림을 받을 때마다 Play Developer API를
 * 다시 불러 진짜 상태를 확정한다 — notificationType 값으로 직접 분기하지 않는다.
 */
public record GooglePlayDeveloperNotification(
        String packageName,
        String eventTimeMillis,
        SubscriptionNotification subscriptionNotification,
        TestNotification testNotification) {

    /** 정기결제 관련 알림. notificationType 코드는 참고용으로만 남기고 분기에는 쓰지 않는다. */
    public record SubscriptionNotification(int notificationType, String purchaseToken, String subscriptionId) {
    }

    /** Play Console "테스트 알림 보내기" 버튼이 보내는 형태 — purchaseToken이 없어 처리할 게 없다. */
    public record TestNotification(String version) {
    }
}
