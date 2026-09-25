package com.fitto.common.plan;

import java.util.Arrays;
import java.util.Optional;

/**
 * 스토어에서 파는 <b>소모성 크레딧 상품</b> — 상품 id ↔ (기능, 회수).
 *
 * <p>구독({@code pro_monthly})은 플랜을 바꾸지만, 여기 상품은 플랜은 그대로 둔 채 특정 기능의
 * 사용 가능 횟수만 더한다. 상품 id 는 양쪽 스토어에 <b>같은 값</b>으로 등록한다(구독과 같은
 * 규칙 — 플랫폼 분기를 없앤다). 앱의 {@code constants/config.ts} 와 값이 같아야 한다.
 *
 * <p>검증은 <b>앱이 말한 상품이 아니라 스토어가 돌려준 상품</b>으로 한다
 * ({@link FeatureCreditService}). 여기 없는 상품 id 가 오면 크레딧을 주지 않는다.
 */
public enum CreditProduct {
    /** 우리 이모지 한 세트(요청 1회 = 최대 5장) 추가. */
    EMOJI_SET_1("emoji_set_1", Feature.AI_COUPLE_EMOJI, 1);

    private final String productId;
    private final Feature feature;
    private final int credits;

    CreditProduct(String productId, Feature feature, int credits) {
        this.productId = productId;
        this.feature = feature;
        this.credits = credits;
    }

    public String productId() {
        return productId;
    }

    public Feature feature() {
        return feature;
    }

    public int credits() {
        return credits;
    }

    public static Optional<CreditProduct> byProductId(String productId) {
        return Arrays.stream(values()).filter(p -> p.productId.equals(productId)).findFirst();
    }
}
