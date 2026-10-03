package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.security.AuthUser;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.user.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code GET /plan/me} 의 {@code couplePlan} — "상대가 결제했으면 커플 기능은 PRO"를 앱이 알 수 있는가.
 *
 * <p>개인 플랜({@code plan})만 내려주던 때는 결제한 사람의 상대 화면이 그냥 FREE 로 보이고
 * 결제 버튼이 그대로 열렸다 — 상대가 이미 PRO 인 줄 모르고 한 번 더 결제하게 된다
 * (docs/my-current-state.md §7-1).
 *
 * <p>프로퍼티는 {@link PlanProUnlockTest} 와 똑같이 둔다 — 조합이 다르면 스프링 컨텍스트가 하나 더
 * 생겨 JVM 끝까지 캐시된다(CLAUDE.md 6절, 2026-09-22 OOM).
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        "fitto.plan.trial-days=0"})
@ActiveProfiles("test")
@Transactional
class PlanCouplePlanTest {

    private static final String IP = "127.0.0.1";

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlanController planController;
    @Autowired
    SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    private PlanResponse me(Long userId) {
        return planController.me(new AuthUser(userId, Role.USER)).data();
    }

    private FeatureState stateOf(PlanResponse response, Feature feature) {
        return response.features().stream()
                .filter(s -> s.feature().equals(feature.name()))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void 상대가_결제하면_내_개인_플랜은_FREE_커플_플랜은_PRO_다() {
        Long payer = register("couple-plan-payer@fitto.com");
        Long partner = register("couple-plan-partner@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(payer);
        relationService.connectCouple(partner, invite.code());
        TestPro.grant(subscriptionRepository, payer);

        PlanResponse asPartner = me(partner);

        assertThat(asPartner.plan()).isEqualTo(Plan.FREE);
        assertThat(asPartner.couplePlan()).isEqualTo(Plan.PRO);
        // 앱이 그리는 문구와 실제 판정이 같아야 한다 — 커플 기능은 열리고 개인 기능은 FREE 한도다
        assertThat(stateOf(asPartner, Feature.MEMORIES).allowed()).isTrue();
        assertThat(stateOf(asPartner, Feature.FULL_STATS).allowed()).isFalse();

        PlanResponse asPayer = me(payer);
        assertThat(asPayer.plan()).isEqualTo(Plan.PRO);
        assertThat(asPayer.couplePlan()).isEqualTo(Plan.PRO);
    }

    @Test
    void 커플이_없으면_커플_플랜은_개인_플랜과_같다() {
        Long solo = register("couple-plan-solo@fitto.com");

        assertThat(me(solo).couplePlan()).isEqualTo(Plan.FREE);

        TestPro.grant(subscriptionRepository, solo);
        assertThat(me(solo).couplePlan()).isEqualTo(Plan.PRO);
    }

    @Test
    void 연결을_끊으면_상대_구독은_더_이상_커플_플랜에_잡히지_않는다() {
        Long payer = register("couple-plan-end-payer@fitto.com");
        Long partner = register("couple-plan-end-partner@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(payer);
        Long relationId = relationService.connectCouple(partner, invite.code()).id();
        TestPro.grant(subscriptionRepository, payer);

        relationService.endRelation(partner, relationId);

        assertThat(me(partner).couplePlan()).isEqualTo(Plan.FREE);
    }
}
