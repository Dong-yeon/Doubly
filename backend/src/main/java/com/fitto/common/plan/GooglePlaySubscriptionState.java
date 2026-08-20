package com.fitto.common.plan;

import java.time.LocalDateTime;

/**
 * Play Developer API 조회 결과 — 웹훅 판정의 실제 근거(진실 소스).
 *
 * @param userId 구매 시 안드로이드 클라이언트가 {@code setObfuscatedAccountId(userId)}로 실어
 *               보낸 값. 아직 클라이언트에 결제 SDK가 붙기 전이라 지금은 항상 {@code null}일 수
 *               있다 — 그 경우 {@link GooglePlaySubscriptionSyncService}가 새 구독을 만들지
 *               않고 건너뛴다(이미 연결된 구독의 갱신/만료 반영은 purchaseToken만으로 된다).
 */
public record GooglePlaySubscriptionState(
        SubscriptionStatus status,
        String productId,
        LocalDateTime expiresAt,
        boolean autoRenew,
        Long userId) {
}
