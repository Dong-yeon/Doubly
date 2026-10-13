package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 남은 크레딧 1회를 두 요청이 동시에 쓰면 <b>한쪽만</b> 성공한다(docs/EMOJI_12_REGEN_2026-10-13.md §1-3).
 *
 * <p>회귀 방지: 차감은 읽고 → 메모리에서 {@code used++} → 더티 체킹으로 쓴다. 잠금이 없을 때는 두 트랜잭션이
 * 같은 {@code used=0} 을 읽고 둘 다 {@code used=1} 을 써서, 크레딧 하나로 세트 두 개가 나갔다.
 *
 * <p>프로퍼티·목을 더하지 않는다 — 기본 컨텍스트를 같이 써서 스프링 컨텍스트를 늘리지 않기 위해서다(CLAUDE.md §6).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeatureCreditConcurrencyTest {

    @Autowired AuthService authService;
    @Autowired FeatureCreditService creditService;
    @Autowired FeatureCreditRepository repository;

    @Test
    void 마지막_한_회를_동시에_쓰면_한쪽만_성공한다() throws Exception {
        Long user = authService.register(
                new RegisterRequest("credit-race@fitto.com", "password123", "U", null, null, true, true, false),
                "127.0.0.1").user().id();
        repository.save(FeatureCredit.builder().userId(user).feature(Feature.AI_COUPLE_EMOJI)
                .store(Store.MANUAL).productId("emoji_set_1").transactionId("race-1").credits(1).build());

        int racers = 4;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(racers);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < racers; i++) {
                Callable<Boolean> race = () -> {
                    start.await();
                    return creditService.consumeOne(user, Feature.AI_COUPLE_EMOJI);
                };
                results.add(pool.submit(race));
            }
            start.countDown();
            long succeeded = 0;
            for (Future<Boolean> result : results) {
                if (result.get()) succeeded++;
            }

            assertThat(succeeded).isEqualTo(1);
            assertThat(creditService.remaining(user, Feature.AI_COUPLE_EMOJI)).isZero();
            assertThat(repository.findByTransactionId("race-1").orElseThrow().getUsed()).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
