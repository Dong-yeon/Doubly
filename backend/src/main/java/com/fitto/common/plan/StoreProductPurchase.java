package com.fitto.common.plan;

/**
 * 일회성 상품(non-consumable) 한 건의 스토어 조회 결과 — 구독의
 * {@link GooglePlaySubscriptionState}·{@link AppStoreSubscriptionState} 에 대응한다.
 *
 * <p>구독과 달리 만료도 갱신도 없어서 물어볼 게 셋뿐이다: <b>무슨 상품인지 · 누구 것인지 ·
 * 아직 유효한지</b>. 그래서 스토어별로 record 를 나누지 않고 하나로 합쳤다.
 *
 * @param productId 스토어에 등록된 상품 id — {@code StickerPack.productId()} 규칙을 따른다
 * @param userId    구매에 실려 온 계정 식별자에서 되읽은 우리 userId. <b>귀속은 이 값으로만
 *                  정한다</b> — 로그인한 사람이 남의 영수증을 보내도 자기 계정에 붙지 않는다
 *                  (구독 검증과 같은 원칙, {@code PlanController} 주석). 못 읽으면 {@code null}
 * @param valid     결제가 완료됐고 환불·취소되지 않았는가. 보류(pending)도 {@code false} 다
 * @param acknowledged 스토어에서 승인(acknowledge)됐는가 — Google 만 의미가 있다. 애플은 승인 개념이 없어
 *                     늘 {@code true} 다
 */
public record StoreProductPurchase(String productId, Long userId, boolean valid, boolean acknowledged) {

    /** 승인 개념이 없는 스토어·호출부용 — 이미 승인된 것으로 본다. */
    public StoreProductPurchase(String productId, Long userId, boolean valid) {
        this(productId, userId, valid, true);
    }
}
