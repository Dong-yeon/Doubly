package com.fitto.relation;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 커플 초대·연결 — 사람마다 살아 있는 코드는 하나, 연결은 사람 단위로 직렬화
 * (docs/first-experience-audit.md #3~#6·#15·#16).
 *
 * <p>테스트 레벨 @Transactional 을 두지 않는다 — 동시성 테스트는 스레드마다 독립 트랜잭션이 필요하고,
 * 나머지도 서비스 트랜잭션 경계(커밋)를 그대로 거쳐야 실제 동작과 같다.
 */
@SpringBootTest
@ActiveProfiles("test")
class CoupleInviteFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired RelationRepository relationRepository;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    private long activeCouples(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE).size();
    }

    @Test
    void 새_코드를_만들면_옛_코드는_무효가_되고_대기_행은_하나뿐이다() {
        Long a = register("invite-regen-a@fitto.com");
        Long b = register("invite-regen-b@fitto.com");

        String first = relationService.createCoupleInvite(a).code();
        String second = relationService.createCoupleInvite(a).code();

        assertThat(second).isNotEqualTo(first);
        assertThat(relationRepository.findPendingCoupleInvites(a)).hasSize(1);
        assertThatThrownBy(() -> relationService.connectCouple(b, first))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVITE_CODE_INVALID);
        relationService.connectCouple(b, second);
        assertThat(activeCouples(a)).isEqualTo(1);
    }

    @Test
    void 살아_있는_코드를_다시_조회할_수_있다() {
        Long a = register("invite-find-a@fitto.com");

        assertThat(relationService.findCoupleInvite(a)).isNull();
        InviteCodeResponse created = relationService.createCoupleInvite(a);
        assertThat(relationService.findCoupleInvite(a).code()).isEqualTo(created.code());
    }

    @Test
    void 초대한_쪽이_이미_다른_사람과_연결됐으면_남은_코드로는_연결되지_않는다() {
        Long a = register("invite-taken-a@fitto.com");
        Long b = register("invite-taken-b@fitto.com");
        Long c = register("invite-taken-c@fitto.com");

        // A 가 코드를 뿌려 둔 채 B 의 코드로 연결 — A 의 코드는 연결 순간 비워진다
        String aCode = relationService.createCoupleInvite(a).code();
        String bCode = relationService.createCoupleInvite(b).code();
        relationService.connectCouple(a, bCode);

        assertThat(relationService.findCoupleInvite(a)).isNull();
        assertThatThrownBy(() -> relationService.connectCouple(c, aCode))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVITE_CODE_INVALID);
        assertThat(activeCouples(a)).isEqualTo(1);
        assertThat(activeCouples(c)).isZero();
    }

    @Test
    void 서로의_코드를_동시에_넣어도_활성_커플은_하나만_생긴다() throws Exception {
        Long a = register("invite-mutual-a@fitto.com");
        Long b = register("invite-mutual-b@fitto.com");
        String aCode = relationService.createCoupleInvite(a).code();
        String bCode = relationService.createCoupleInvite(b).code();

        List<Exception> failures = race(
                () -> relationService.connectCouple(a, bCode),
                () -> relationService.connectCouple(b, aCode));

        assertThat(failures).hasSize(1);
        assertThat(activeCouples(a)).isEqualTo(1);
        assertThat(activeCouples(b)).isEqualTo(1);
    }

    @Test
    void 두_사람이_같은_코드를_동시에_넣으면_한_명만_연결된다() throws Exception {
        Long a = register("invite-same-a@fitto.com");
        Long b = register("invite-same-b@fitto.com");
        Long c = register("invite-same-c@fitto.com");
        String aCode = relationService.createCoupleInvite(a).code();

        List<Exception> failures = race(
                () -> relationService.connectCouple(b, aCode),
                () -> relationService.connectCouple(c, aCode));

        assertThat(failures).hasSize(1);
        assertThat(activeCouples(a)).isEqualTo(1);
        assertThat(activeCouples(b) + activeCouples(c)).isEqualTo(1);
    }

    /** 두 작업을 같은 순간에 출발시키고, 실패한 쪽의 예외만 모은다. */
    private List<Exception> race(Runnable first, Runnable second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (Runnable task : List.of(first, second)) {
                futures.add(pool.submit(() -> {
                    start.await();
                    task.run();
                    return null;
                }));
            }
            start.countDown();
            List<Exception> failures = new ArrayList<>();
            for (Future<?> f : futures) {
                try {
                    f.get(10, TimeUnit.SECONDS);
                } catch (java.util.concurrent.ExecutionException e) {
                    assertThat(e.getCause()).isInstanceOf(BusinessException.class);
                    failures.add((Exception) e.getCause());
                }
            }
            return failures;
        } finally {
            pool.shutdownNow();
        }
    }
}
