package com.fitto.common.plan;

import java.time.LocalDateTime;

/**
 * App Store Server API 조회 결과 — 판정의 실제 근거(진실 소스).
 *
 * <p>{@link GooglePlaySubscriptionState} 와 같은 역할이다. 다른 점 하나는
 * {@code originalTransactionId} 를 함께 들고 온다는 것 — 갱신될 때마다 거래 id 는 바뀌지만
 * 이 값은 고정이라, 우리 {@code subscriptions.purchase_token} 의 키로 이것을 쓴다.
 *
 * @param userId 구매 시 클라이언트가 실어 보낸 {@code appAccountToken}(UUID)에서 되읽은 값.
 *               없으면 {@code null} — 그 경우 새 구독을 만들지 않고 건너뛴다.
 */
public record AppStoreSubscriptionState(
        SubscriptionStatus status,
        String productId,
        String originalTransactionId,
        LocalDateTime expiresAt,
        boolean autoRenew,
        Long userId) {
}
