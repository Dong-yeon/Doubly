package com.fitto.common.plan;

import java.util.Arrays;
import java.util.Optional;

/**
 * 영구(비소모성) 상품 — 사면 {@link UserEntitlement} 한 행이 생긴다.
 *
 * <p>{@link SubscriptionProducts}(구독)·{@link CreditProduct}(세트)·{@code CurrencyPack}(크라운)과 나란한 네 번째 상품 축.
 * 스토어 id 는 콘솔에 한 번 만들면 바꿀 수 없다 — 앱 상수({@code PLUS_LIFETIME_PRODUCT_ID})와 같아야 한다.
 */
public enum LifetimeProduct {

    /** Dubly Plus 영구 — 19,000원(docs/DUBLY_PLUS_PLAN_2026-10-14.md §0). 광고 제거, 커플 한 명이 사면 둘 다. */
    PLUS_LIFETIME("plus_lifetime", UserEntitlement.Kind.AD_FREE);

    private final String productId;
    private final UserEntitlement.Kind entitlement;

    LifetimeProduct(String productId, UserEntitlement.Kind entitlement) {
        this.productId = productId;
        this.entitlement = entitlement;
    }

    public String productId() {
        return productId;
    }

    public UserEntitlement.Kind entitlement() {
        return entitlement;
    }

    public static Optional<LifetimeProduct> byProductId(String productId) {
        return Arrays.stream(values()).filter(p -> p.productId.equals(productId)).findFirst();
    }
}
