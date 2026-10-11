package com.fitto.sticker.dto;

/**
 * 결제 직후 앱이 보내는 값 — 구독 검증({@code GooglePurchaseVerifyRequest} ·
 * {@code ApplePurchaseVerifyRequest})과 같은 모양이되 팩 id 가 하나 더 붙는다.
 *
 * <p>구독은 상품이 하나뿐이라 토큰만으로 무엇을 샀는지가 정해졌다. 팩은 여러 개라
 * Play 조회에 상품 id 가 필요하고, App Store 쪽도 "앱이 산 줄 알고 있는 팩"과 스토어
 * 응답을 대조해야 짝이 어긋난 영수증을 잡을 수 있다 — 이 값은 <b>검증 대상이지 근거가
 * 아니다</b>({@code StickerPurchaseService} 주석).
 *
 * @param receipt Play 는 {@code purchaseToken}, App Store 는 {@code transactionId}
 */
public record StickerPurchaseVerifyRequest(String packId, String receipt) {
}
