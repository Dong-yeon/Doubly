package com.fitto.common.plan;

/** {@code POST /api/v1/plan/purchases/google} 요청 본문 — 클라이언트가 방금 받은 스토어 거래 토큰. */
public record GooglePurchaseVerifyRequest(String purchaseToken) {
}
