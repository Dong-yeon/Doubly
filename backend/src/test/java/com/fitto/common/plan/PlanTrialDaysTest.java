package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 가입 후 N일 체험 — {@code fitto.plan.trial-days}.
 *
 * <p>전역 체험({@code free-trial})을 <b>끈</b> 상태에서 돈다. 켜져 있으면 전원 PRO 라
 * 이 분기가 실행되지 않는다({@link PlanFreeTrialTest} 가 그쪽을 본다).
 *
 * <p>"체험이 0일이면 가입 직후에도 FREE" 는 {@link PlanFlowTest} 가 이미 덮는다 —
 * 그 클래스가 {@code trial-days=0} 으로 돌면서 갓 가입한 사용자를 FREE 로 단언한다.
 */
@SpringBootTest(properties = {"fitto.plan.free-trial=false", "fitto.plan.trial-days=3"})
@ActiveProfiles("test")
class PlanTrialDaysTest {

    private static final String IP = "127.0.0.1";

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlanResolver planResolver;
    @PersistenceContext
    EntityManager em;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    /**
     * 가입 시각을 과거로 되돌린다 — {@code @CreatedDate} 는 애플리케이션이 채우므로
     * 네이티브 UPDATE 로만 바꿀 수 있다({@code CallSessionSweeperTest.backdate} 와 같은 방법).
     */
    private void joinedDaysAgo(Long userId, long days) {
        em.createNativeQuery("update users set created_at = :t where id = :id")
                .setParameter("t", LocalDateTime.now().minusDays(days))
                .setParameter("id", userId)
                .executeUpdate();
        em.flush();
        em.clear();
    }

    @Test
    @Transactional
    void 가입_직후에는_구독이_없어도_PRO_다() {
        Long user = register("trial-fresh@fitto.com");

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.PRO);
        assertThat(planResolver.isInTrial(user)).isTrue();
    }

    @Test
    @Transactional
    void 체험_기간이_지나면_FREE_로_떨어진다() {
        Long user = register("trial-expired@fitto.com");
        joinedDaysAgo(user, 4);

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.FREE);
        assertThat(planResolver.isInTrial(user)).isFalse();
    }

    @Test
    @Transactional
    void 체험_종료_시각은_가입_시각에_설정한_일수를_더한_값이다() {
        Long user = register("trial-endsat@fitto.com");
        joinedDaysAgo(user, 1);

        LocalDateTime endsAt = planResolver.trialEndsAt(user);

        // 하루 전에 가입했으니 이틀 뒤에 끝난다. 초 단위 오차는 now() 호출 시점 차이다.
        assertThat(endsAt).isNotNull();
        assertThat(endsAt).isAfter(LocalDateTime.now().plusDays(2).minusMinutes(1));
        assertThat(endsAt).isBefore(LocalDateTime.now().plusDays(2).plusMinutes(1));
    }

    @Test
    @Transactional
    void 커플은_나중에_가입한_사람의_체험이_끝날_때까지_함께_열려_있다() {
        Long older = register("trial-couple-old@fitto.com");
        Long newer = register("trial-couple-new@fitto.com");
        joinedDaysAgo(older, 10);   // 먼저 들어온 쪽은 체험이 이미 끝났다

        InviteCodeResponse invite = relationService.createCoupleInvite(older);
        Long relationId = relationService.connectCouple(newer, invite.code()).id();

        // 개인 판정은 각자의 가입 시각을 따른다
        assertThat(planResolver.resolve(older)).isEqualTo(Plan.FREE);
        assertThat(planResolver.resolve(newer)).isEqualTo(Plan.PRO);

        /*
         * 커플 콘텐츠는 둘 중 높은 등급을 쓴다 — 한 명의 체험이 끝났다고 같은 여행·피드가
         * 반쪽만 잠기면 안 된다. 그래서 늦게 들어온 쪽의 체험이 관계 전체를 연다.
         */
        assertThat(planResolver.resolveForRelation(relationId)).isEqualTo(Plan.PRO);
        assertThat(planResolver.resolveFor(older, Feature.VIDEO_CALL)).isEqualTo(Plan.PRO);
        // 개인 기능은 그대로 본인 기준
        assertThat(planResolver.resolveFor(older, Feature.AI_FOOD_PHOTO)).isEqualTo(Plan.FREE);
    }
}
