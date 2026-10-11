package com.fitto.common.plan;

/**
 * 크레딧 상품 결제 직후 앱이 보내는 값 — {@code POST /api/v1/plan/credits/purchases/{google,apple}}.
 *
 * <p>구독 검증과 같은 모양이되 상품 id 가 하나 더 붙는다. Play 의 일회성 상품 조회가 상품 id 를
 * 요구하기 때문인데, <b>이 값은 검증 대상이지 근거가 아니다</b> — 스토어가 돌려준 상품과 다르면
 * 거절한다({@link FeatureCreditService}).
 *
 * @param receipt Play 는 {@code purchaseToken}, App Store 는 {@code transactionId}
 */
public record CreditPurchaseVerifyRequest(String productId, String receipt) {
}
