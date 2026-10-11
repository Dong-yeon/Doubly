package com.fitto.common.plan;

import java.time.LocalDateTime;

/**
 * 테스트에서 <b>돈 낸 사용자</b>를 만든다.
 *
 * <p>2026-09-22 에 전역 무료 체험을 끄면서 필요해졌다({@code fitto.plan.free-trial=false}).
 * 그전까지는 전원이 PRO 로 판정돼 PRO 기능 테스트가 아무 준비 없이 통과했는데, 이제는
 * <b>구독이 있어야</b> 열린다 — 운영과 같은 조건이다.
 *
 * <p>플랜을 프로퍼티로 다시 켜지({@code free-trial=true}) 않는 이유: 그러면 테스트가
 * 운영에 더 이상 존재하지 않는 모드에서 돌고, "PRO 사용자에게 기능이 열리는가"를
 * 아무도 확인하지 않게 된다. 여기서 만드는 {@link Store#MANUAL} 구독은
 * {@code PlanResolver} 가 실제로 보는 조건(ACTIVE + 만료 전)을 그대로 지난다.
 *
 * <p>커플 기능은 <b>둘 중 높은 등급</b>으로 판정되므로({@code Feature#isCoupleScoped})
 * 한 명만 줘도 열린다. 다만 개인 기능까지 섞인 테스트라면 양쪽에 주는 편이 헷갈리지 않는다.
 */
public final class TestPro {

    private TestPro() {
    }

    /** 이 사용자들을 PRO 로 만든다 — 30일짜리 활성 구독. */
    public static void grant(SubscriptionRepository repository, Long... userIds) {
        for (Long userId : userIds) {
            repository.save(Subscription.builder()
                    .userId(userId)
                    .plan(Plan.PRO)
                    .status(SubscriptionStatus.ACTIVE)
                    .store(Store.MANUAL)
                    .productId("doubly.pro.monthly")
                    .purchaseToken("test-pro-" + userId)
                    .startedAt(LocalDateTime.now().minusDays(1))
                    .expiresAt(LocalDateTime.now().plusDays(30))
                    .build());
        }
    }
}
