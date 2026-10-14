package com.fitto.common.plan;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 광고를 끌까 — Dubly Plus(1개월·1년 구독 또는 영구권)의 유일한 혜택(docs/DUBLY_PLUS_PLAN_2026-10-14.md S2).
 *
 * <p>판정: 본인 또는 <b>활성 커플 상대</b>가 ① 효력 있는 구독(subscriptions)을 가졌거나 ② 환불되지 않은 영구권
 * ({@link UserEntitlement.Kind#AD_FREE})을 가졌다. 트레이너·가족 관계로는 번지지 않는다({@link PlanResolver#activeCoupleIdOf}
 * 는 COUPLE 만 본다). 헤어지면 산 사람만 남는다.
 *
 * <p><b>체험(전역 free-trial·가입 후 N일)은 광고를 끄지 않는다</b> — {@link PlanResolver#resolve} 는 체험을 PRO 로 돌려주므로
 * 여기서는 플랜이 아니라 구독 행을 직접 본다. 체험은 "기능을 미리 써 보기"였고, 기능은 한 등급이 되면 모두에게 열린다.
 */
@Component
public class AdFreeResolver {

    /** 왜 광고가 없나 — 앱이 문구를 고른다("○○님 덕분에 광고 없이"). */
    public enum Source { SELF_LIFETIME, SELF_SUBSCRIPTION, PARTNER, NONE }

    private final PlanResolver planResolver;
    private final SubscriptionRepository subscriptionRepository;
    private final UserEntitlementRepository entitlementRepository;

    public AdFreeResolver(PlanResolver planResolver, SubscriptionRepository subscriptionRepository,
                          UserEntitlementRepository entitlementRepository) {
        this.planResolver = planResolver;
        this.subscriptionRepository = subscriptionRepository;
        this.entitlementRepository = entitlementRepository;
    }

    public boolean isAdFree(Long userId) {
        return sourceOf(userId) != Source.NONE;
    }

    /** 본인 것이 상대 것보다 앞이다 — 본인 영구권 > 본인 구독 > 상대. */
    @Transactional(readOnly = true)
    public Source sourceOf(Long userId) {
        List<Long> members = planResolver.coupleMemberIdsOf(userId);
        List<Long> lifetimeOwners = entitlementRepository.findOwners(members, UserEntitlement.Kind.AD_FREE);
        if (lifetimeOwners.contains(userId)) {
            return Source.SELF_LIFETIME;
        }
        List<Long> subscribers = subscriptionRepository.findEffective(members, LocalDateTime.now()).stream()
                .filter(s -> s.getPlan().isAtLeast(Plan.PRO))
                .map(Subscription::getUserId)
                .toList();
        if (subscribers.contains(userId)) {
            return Source.SELF_SUBSCRIPTION;
        }
        return lifetimeOwners.isEmpty() && subscribers.isEmpty() ? Source.NONE : Source.PARTNER;
    }

    /** 본인이 영구권을 가졌나 — 결제 화면이 영구 카드를 "이미 가짐"으로 바꾼다(상대 것은 세지 않는다). */
    @Transactional(readOnly = true)
    public boolean ownsLifetime(Long userId) {
        return !entitlementRepository.findOwners(List.of(userId), UserEntitlement.Kind.AD_FREE).isEmpty();
    }
}
