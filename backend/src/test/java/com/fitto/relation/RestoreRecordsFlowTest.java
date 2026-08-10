package com.fitto.relation;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RestoreRecordsResponse;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 지난 기록 불러오기 (REL-07) — H2 + 실제 마이그레이션 스키마 기반.
 */
@SpringBootTest
@ActiveProfiles("test")
class RestoreRecordsFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    private Long connect(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code()).id();
    }

    private long placeCount(Long relationId) {
        Number n = (Number) em.createNativeQuery(
                        "select count(*) from places where couple_id = :rid")
                .setParameter("rid", relationId).getSingleResult();
        return n.longValue();
    }

    private void addPlace(Long userId, String name) {
        placeService.save(userId, new SavePlaceRequest(
                name, "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null, null, null));
    }

    /** 헤어졌다 재회하는 전체 흐름. */
    @Test
    @Transactional
    void 양쪽이_모두_요청하면_지난_기록이_복원된다() {
        Long me = register("restore-a@fitto.com");
        Long partner = register("restore-b@fitto.com");
        Long oldRelationId = connect(me, partner);
        addPlace(me, "추억의 맛집");

        relationService.endRelation(me, oldRelationId);
        Long newRelationId = connect(me, partner);
        em.flush();
        em.clear();

        // 재회 직후에는 빈 상태 — 기록은 옛 관계에 남아있다
        assertThat(placeCount(newRelationId)).isZero();
        assertThat(placeCount(oldRelationId)).isEqualTo(1);

        // 한쪽만 요청하면 대기
        assertThat(relationService.requestRestore(me).status())
                .isEqualTo(RestoreRecordsResponse.Status.WAITING_PARTNER);
        em.flush();
        em.clear();
        assertThat(placeCount(newRelationId)).isZero();

        // 상대가 요청하면 복원
        RestoreRecordsResponse result = relationService.requestRestore(partner);
        em.flush();
        em.clear();

        assertThat(result.status()).isEqualTo(RestoreRecordsResponse.Status.RESTORED);
        assertThat(result.movedCount()).isPositive();
        assertThat(placeCount(newRelationId)).isEqualTo(1);
    }

    /** 같은 사람이 두 번 눌러도 상대 동의 없이는 복원되면 안 된다. */
    @Test
    @Transactional
    void 같은_사람이_두_번_요청해도_복원되지_않는다() {
        Long me = register("restore-twice-a@fitto.com");
        Long partner = register("restore-twice-b@fitto.com");
        Long oldRelationId = connect(me, partner);
        addPlace(me, "맛집");

        relationService.endRelation(me, oldRelationId);
        Long newRelationId = connect(me, partner);
        em.flush();
        em.clear();

        assertThat(relationService.requestRestore(me).status())
                .isEqualTo(RestoreRecordsResponse.Status.WAITING_PARTNER);
        assertThat(relationService.requestRestore(me).status())
                .isEqualTo(RestoreRecordsResponse.Status.WAITING_PARTNER);
        em.flush();
        em.clear();

        assertThat(placeCount(newRelationId)).isZero();
    }

    /**
     * 커플 스트릭은 복원하지 않는다.
     * "연속 N일"은 끊김이 없다는 뜻인데 헤어져 있던 기간만큼 실제로 끊겼다 —
     * 그대로 가져오면 공백을 건너뛴 가짜 기록이 된다.
     */
    @Test
    @Transactional
    void 커플_스트릭은_복원되지_않는다() {
        Long me = register("restore-streak-a@fitto.com");
        Long partner = register("restore-streak-b@fitto.com");
        Long oldRelationId = connect(me, partner);

        em.createNativeQuery("insert into streaks "
                        + "(relation_id, streak_type, current_count, max_count, last_workout_date) "
                        + "values (:rid, 'COUPLE', 50, 50, :d)")
                .setParameter("rid", oldRelationId).setParameter("d", LocalDate.now()).executeUpdate();

        relationService.endRelation(me, oldRelationId);
        Long newRelationId = connect(me, partner);
        em.flush();
        em.clear();

        relationService.requestRestore(me);
        relationService.requestRestore(partner);
        em.flush();
        em.clear();

        Number streaks = (Number) em.createNativeQuery(
                        "select count(*) from streaks where relation_id = :rid")
                .setParameter("rid", newRelationId).getSingleResult();
        assertThat(streaks.longValue()).isZero();
    }

    /** 기념일은 옛 관계에 있다 — 복원 시 승계되어야 한다. */
    @Test
    @Transactional
    void 기념일이_승계된다() {
        Long me = register("restore-anniv-a@fitto.com");
        Long partner = register("restore-anniv-b@fitto.com");
        Long oldRelationId = connect(me, partner);
        LocalDate anniversary = LocalDate.of(2024, 3, 1);
        relationService.setAnniversary(me, anniversary);

        relationService.endRelation(me, oldRelationId);
        Long newRelationId = connect(me, partner);
        em.flush();
        em.clear();

        relationService.requestRestore(me);
        relationService.requestRestore(partner);
        em.flush();
        em.clear();

        Object restored = em.createNativeQuery(
                        "select anniversary_date from relations where id = :rid")
                .setParameter("rid", newRelationId).getSingleResult();
        assertThat(restored.toString()).startsWith("2024-03-01");
    }

    @Test
    void 지난_기록이_없으면_불러올_수_없다() {
        Long me = register("restore-none-a@fitto.com");
        Long partner = register("restore-none-b@fitto.com");
        connect(me, partner);

        assertThatThrownBy(() -> relationService.requestRestore(me))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.NO_RECORDS_TO_RESTORE);
    }

    /** 다른 사람과 재연결한 경우, 이전 상대와의 기록은 대상이 아니다. */
    @Test
    @Transactional
    void 다른_사람과_연결하면_이전_기록은_복원_대상이_아니다() {
        Long me = register("restore-other-a@fitto.com");
        Long ex = register("restore-other-b@fitto.com");
        Long newPartner = register("restore-other-c@fitto.com");

        Long oldRelationId = connect(me, ex);
        addPlace(me, "예전 맛집");
        relationService.endRelation(me, oldRelationId);

        connect(me, newPartner);
        em.flush();
        em.clear();

        assertThatThrownBy(() -> relationService.requestRestore(me))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.NO_RECORDS_TO_RESTORE);
    }

    @Test
    @Transactional
    void 복원_가능_여부를_조회할_수_있다() {
        Long me = register("restore-check-a@fitto.com");
        Long partner = register("restore-check-b@fitto.com");
        Long oldRelationId = connect(me, partner);
        addPlace(me, "맛집");

        relationService.endRelation(me, oldRelationId);
        connect(me, partner);
        em.flush();
        em.clear();

        assertThat(relationService.hasRestorableRecords(me)).isTrue();
    }
}
