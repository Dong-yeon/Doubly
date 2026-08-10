package com.fitto.relation;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RestoreRecordsResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 지난 기록 불러오기 — 동시 요청 직렬화 (REL-07).
 *
 * <p>restore_requested_by 는 읽고-판단하고-쓰는 3단계라, 잠금이 없으면 양쪽이 동시에
 * 요청할 때 둘 다 null 을 읽어 서로를 덮어쓰고 <b>둘 다 WAITING</b> 이 될 수 있었다
 * (합의가 성립했는데 복원이 실행되지 않는 상태).
 *
 * <p>행 잠금(SELECT FOR UPDATE)으로 두 요청이 직렬화되면 결과는 항상
 * {WAITING_PARTNER, RESTORED} 한 쌍이다. 경합은 비결정적이라 "잠금 제거 시 반드시
 * 실패"를 보장할 수는 없지만, 이 테스트는 잠금이 보장해야 할 계약을 고정한다.
 * (테스트 레벨 @Transactional 을 두지 않는다 — 스레드마다 독립 트랜잭션이 필요하다)
 */
@SpringBootTest
@ActiveProfiles("test")
class RestoreConcurrencyTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired RelationRepository relationRepository;

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

    @Test
    void 양쪽이_동시에_요청하면_한쪽은_접수_한쪽은_복원으로_끝난다() throws Exception {
        Long a = register("race-a@fitto.com");
        Long b = register("race-b@fitto.com");
        Long oldRelationId = connect(a, b);
        placeService.save(a, new SavePlaceRequest(
                "추억의 맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null, null, null));
        relationService.endRelation(a, oldRelationId);
        Long newRelationId = connect(a, b);

        // 두 스레드를 같은 순간에 출발시켜 경합 창을 최대화한다
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<RestoreRecordsResponse> fa = pool.submit(() -> {
                start.await();
                return relationService.requestRestore(a);
            });
            Future<RestoreRecordsResponse> fb = pool.submit(() -> {
                start.await();
                return relationService.requestRestore(b);
            });
            start.countDown();

            List<RestoreRecordsResponse.Status> statuses = List.of(
                    fa.get(10, TimeUnit.SECONDS).status(),
                    fb.get(10, TimeUnit.SECONDS).status());

            // 잠금이 없으면 (WAITING, WAITING) 으로 끝나 복원이 영영 실행되지 않을 수 있다
            assertThat(statuses).containsExactlyInAnyOrder(
                    RestoreRecordsResponse.Status.WAITING_PARTNER,
                    RestoreRecordsResponse.Status.RESTORED);
        } finally {
            pool.shutdownNow();
        }

        // 복원이 실제로 실행됐는지 — 옛 관계는 사라지고 기록은 새 관계로 이동
        assertThat(relationRepository.findEndedCoupleBetween(a, b)).isEmpty();
        Number moved = (Number) em.createNativeQuery(
                        "select count(*) from places where couple_id = :rid")
                .setParameter("rid", newRelationId).getSingleResult();
        assertThat(moved.longValue()).isEqualTo(1);
    }

    /** 한쪽이 이미 요청해둔 상태에서 상대가 요청하면(순차) 복원된다 — 잠금 도입 후 회귀 방지. */
    @Test
    void 순차_요청은_기존과_동일하게_동작한다() {
        Long a = register("race-seq-a@fitto.com");
        Long b = register("race-seq-b@fitto.com");
        Long oldRelationId = connect(a, b);
        placeService.save(b, new SavePlaceRequest(
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null, null, null));
        relationService.endRelation(b, oldRelationId);
        connect(a, b);

        assertThat(relationService.requestRestore(a).status())
                .isEqualTo(RestoreRecordsResponse.Status.WAITING_PARTNER);
        assertThat(relationService.requestRestore(b).status())
                .isEqualTo(RestoreRecordsResponse.Status.RESTORED);
    }
}
