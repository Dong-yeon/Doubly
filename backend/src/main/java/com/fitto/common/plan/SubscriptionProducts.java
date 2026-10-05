package com.fitto.common.plan;

import java.util.Set;

/**
 * PRO 를 주는 구독 상품 id — 양쪽 스토어에 <b>같은 값</b>으로 등록한다(docs/APP_STORE_BILLING.md,
 * 앱 {@code constants/config.ts} 의 {@code PRO_SUBSCRIPTION_SKUS}).
 *
 * <p>예전 동기화는 스토어가 돌려준 상품 id 를 보지 않고 무조건 {@link Plan#PRO} 로 저장했다. 같은 앱
 * 계정에 나중에 다른 구독 상품(예: 다른 등급, 테스트 상품)이 생기면 그것도 PRO 가 된다
 * (docs/my-current-state.md §7-2). 여기 없는 상품이면 구독을 만들지 않는다 — 앱과 어긋나면
 * {@code StoreProductIdSyncTest} 가 잡는다.
 */
public final class SubscriptionProducts {

    /** 월간·연간 — 둘 다 같은 PRO 다. */
    public static final Set<String> PRO = Set.of("pro_monthly", "pro_yearly");

    private SubscriptionProducts() {
    }

    public static boolean grantsPro(String productId) {
        return productId != null && PRO.contains(productId);
    }
}
