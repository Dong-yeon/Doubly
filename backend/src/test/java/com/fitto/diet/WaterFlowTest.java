package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.dto.WaterSummaryResponse;
import com.fitto.diet.service.WaterService;
import com.fitto.relation.dto.InviteCodeResponse;
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

/** 물 섭취 트래커 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class WaterFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    WaterService waterService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 처음_조회하면_0ml에_기본_목표_2000ml이다() {
        Long user = register("wtr1@fitto.com");

        WaterSummaryResponse res = waterService.today(user);

        assertThat(res.consumedMl()).isZero();
        assertThat(res.targetMl()).isEqualTo(2000);
        assertThat(res.coupleConnected()).isFalse();
    }

    @Test
    void 물을_추가하면_누적된다() {
        Long user = register("wtr2@fitto.com");

        waterService.add(user, 250);
        WaterSummaryResponse res = waterService.add(user, 500);

        assertThat(res.consumedMl()).isEqualTo(750);
    }

    @Test
    void 음수로_되돌릴_수_있지만_0_아래로는_내려가지_않는다() {
        Long user = register("wtr3@fitto.com");
        waterService.add(user, 250);

        WaterSummaryResponse res = waterService.add(user, -1000);

        assertThat(res.consumedMl()).isZero();
    }

    @Test
    void 목표를_설정하면_반영된다() {
        Long user = register("wtr4@fitto.com");

        WaterSummaryResponse res = waterService.setGoal(user, 2500);

        assertThat(res.targetMl()).isEqualTo(2500);
    }

    @Test
    void 커플이면_상대방의_오늘_섭취량도_함께_보인다() {
        Long a = register("wtrc1@fitto.com");
        Long b = register("wtrc2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        waterService.add(b, 500);
        WaterSummaryResponse res = waterService.today(a);

        assertThat(res.coupleConnected()).isTrue();
        assertThat(res.partnerConsumedMl()).isEqualTo(500);
    }

    /** 동시에 n 번 더한다 — 모두 한 출발선에서 풀어 실제로 겹치게 한다. 실패한 요청이 있으면 그 예외로 테스트가 깨진다 */
    private void addConcurrently(Long user, int times, int deltaMl) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(times);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (int i = 0; i < times; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return waterService.add(user, deltaMl);
                }));
            }
            start.countDown();
            for (Future<?> f : futures) f.get(30, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * 그날 첫 요청이 둘 이상 겹치면 모두 "행 없음"을 보고 INSERT 한다 — 예전엔 진 쪽이 unique 위반으로 500 이었다.
     * 이제 진 쪽은 UPDATE 로 다시 더해 하나도 잃지 않는다.
     */
    @Test
    void 그날_첫_요청이_동시에_와도_모두_더해진다() throws Exception {
        Long user = register("wtrr1@fitto.com");

        addConcurrently(user, 4, 250);

        assertThat(waterService.today(user).consumedMl()).isEqualTo(1000);
    }

    /** 예전엔 읽고-더하고-쓰기라 같은 값을 읽은 요청끼리 덮어써 조용히 사라졌다(lost update) */
    @Test
    void 연타가_동시에_와도_하나도_잃지_않는다() throws Exception {
        Long user = register("wtrr2@fitto.com");
        waterService.add(user, 250);

        addConcurrently(user, 10, 250);

        assertThat(waterService.today(user).consumedMl()).isEqualTo(2750);
    }

    @Test
    void 행이_없는_날_음수로_시작해도_0이다() {
        Long user = register("wtrr3@fitto.com");

        WaterSummaryResponse res = waterService.add(user, -250);

        assertThat(res.consumedMl()).isZero();
    }
}
