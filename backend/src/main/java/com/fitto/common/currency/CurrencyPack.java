package com.fitto.common.currency;

import java.util.Arrays;
import java.util.Optional;

/**
 * 스토어에서 파는 재화 묶음 — 상품 id ↔ 지급량. <b>1 재화 = 100원 고정</b>이라 지급량 = 가격 ÷ 100 이고 보너스는 없다.
 *
 * <p>상품 id 는 양쪽 스토어에 같은 값으로 등록한다(구독·크레딧과 같은 규칙). 콘솔에 아직 없는 묶음은 앱이 가격을 못 받아
 * 그리지 않으므로 여기 미리 있어도 해가 없다. <b>묶음 크기는 잠정</b> — Apple 원화 가격 단계에 3,900·9,900·29,900 원이
 * 있는지 확인 전이다(docs/CURRENCY_EMOJI_2026-10-13.md §10-7). 검증은 앱이 말한 상품이 아니라 스토어가 돌려준 상품으로 한다.
 */
public enum CurrencyPack {
    CURRENCY_39("currency_39", 39),
    CURRENCY_99("currency_99", 99),
    CURRENCY_299("currency_299", 299);

    private final String productId;
    private final long amount;

    CurrencyPack(String productId, long amount) {
        this.productId = productId;
        this.amount = amount;
    }

    public String productId() {
        return productId;
    }

    public long amount() {
        return amount;
    }

    public static Optional<CurrencyPack> byProductId(String productId) {
        return Arrays.stream(values()).filter(p -> p.productId.equals(productId)).findFirst();
    }
}
