package com.fitto.common.plan;

/**
 * 앱이 결제 직후 보내는 거래 id — {@code POST /api/v1/plan/purchases/apple}.
 *
 * <p>영수증 전체가 아니라 id 하나만 받는다. 서버가 그 id 로 애플에게 직접 되묻기 때문에
 * (App Store Server API) 앱이 보낸 내용을 믿을 필요가 없다 — 구글 쪽 {@code purchaseToken} 과
 * 같은 구조다.
 */
public record ApplePurchaseVerifyRequest(String transactionId) {
}
