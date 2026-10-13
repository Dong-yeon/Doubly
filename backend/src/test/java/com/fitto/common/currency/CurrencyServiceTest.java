package com.fitto.common.currency;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Store;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 유료 재화 — 충전·지출·환불·회수(docs/CURRENCY_EMOJI_2026-10-13.md §7).
 *
 * <p>프로퍼티·목을 더하지 않는다 — 기본 컨텍스트를 같이 써서 스프링 컨텍스트를 늘리지 않는다(CLAUDE.md §6).
 */
@SpringBootTest
@ActiveProfiles("test")
class CurrencyServiceTest {

    @Autowired AuthService authService;
    @Autowired CurrencyService currency;
    @Autowired com.fitto.auth.service.UserDataPurger userDataPurger;
    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(new RegisterRequest(email, "password123", "U", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long ledgerSum(Long userId) {
        Number sum = (Number) em.createNativeQuery(
                "select coalesce(sum(paid_delta), 0) from currency_ledger where user_id = :u")
                .setParameter("u", userId).getSingleResult();
        return sum.longValue();
    }

    @Test
    void 충전은_같은_거래를_한_번만_넣고_원장과_잔액이_맞는다() {
        Long user = register("cur-grant@fitto.com");

        assertThat(currency.grantPurchase(user, Store.GOOGLE_PLAY, "currency_39", "tx-g1", 39)).isTrue();
        // 재설치·연타·웹훅 — 같은 거래는 다시 넣지 않는다
        assertThat(currency.grantPurchase(user, Store.GOOGLE_PLAY, "currency_39", "tx-g1", 39)).isFalse();

        assertThat(currency.balance(user)).isEqualTo(39);
        assertThat(ledgerSum(user)).isEqualTo(39);
        assertThat(currency.isCurrencyPurchase("tx-g1")).isTrue();
    }

    @Test
    void 지출은_모자라면_402_이고_잔액을_건드리지_않는다() {
        Long user = register("cur-short@fitto.com");
        currency.grantPurchase(user, Store.APP_STORE, "currency_39", "tx-s1", 30);

        assertThatThrownBy(() -> currency.spend(user, 39, "EMOJI_SET", null, "spend:t:1"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.CURRENCY_INSUFFICIENT);
        assertThat(currency.balance(user)).isEqualTo(30);
        assertThat(ledgerSum(user)).isEqualTo(30);
    }

    @Test
    void 지출과_환불은_같은_키로_두_번_와도_한_번만_반영된다() {
        Long user = register("cur-idem@fitto.com");
        currency.grantPurchase(user, Store.GOOGLE_PLAY, "currency_99", "tx-i1", 99);

        currency.spend(user, 39, "EMOJI_SET", "b1", "spend:t:2");
        currency.spend(user, 39, "EMOJI_SET", "b1", "spend:t:2");
        assertThat(currency.balance(user)).isEqualTo(60);

        currency.refundSpend(user, 39, "EMOJI_SET", "b1", "spend:t:2");
        currency.refundSpend(user, 39, "EMOJI_SET", "b1", "spend:t:2");
        assertThat(currency.balance(user)).isEqualTo(99);
        // 빼지 않은 지출은 돌려주지 않는다 — 없는 키로 환불을 불러도 잔액이 늘지 않는다
        currency.refundSpend(user, 39, "EMOJI_SET", "b2", "spend:t:never");
        assertThat(currency.balance(user)).isEqualTo(99);
        assertThat(ledgerSum(user)).isEqualTo(99);
    }

    @Test
    void 마지막_39를_동시에_쓰면_한_번만_나간다() throws Exception {
        Long user = register("cur-race@fitto.com");
        currency.grantPurchase(user, Store.GOOGLE_PLAY, "currency_39", "tx-r1", 39);

        int racers = 4;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(racers);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < racers; i++) {
                String key = "spend:race:" + i;   // 서로 다른 요청 — 멱등이 아니라 잔액 조건이 막아야 한다
                Callable<Boolean> race = () -> {
                    start.await();
                    try {
                        currency.spend(user, 39, "EMOJI_SET", null, key);
                        return true;
                    } catch (BusinessException e) {
                        return false;
                    }
                };
                results.add(pool.submit(race));
            }
            start.countDown();
            long succeeded = 0;
            for (Future<Boolean> r : results) {
                if (r.get()) succeeded++;
            }
            assertThat(succeeded).isEqualTo(1);
            assertThat(currency.balance(user)).isZero();
            assertThat(ledgerSum(user)).isZero();
        } finally {
            pool.shutdownNow();
        }
    }

    /** 이미 쓴 뒤 환불되면 빚(음수)이 된다 — 결정 §10-2. 웹훅이 두 번 와도 한 번만 회수한다. */
    @Test
    void 환불_회수는_한_번만이고_이미_썼으면_음수가_된다() {
        Long user = register("cur-revoke@fitto.com");
        currency.grantPurchase(user, Store.APP_STORE, "currency_39", "tx-v1", 39);
        currency.spend(user, 39, "EMOJI_SET", "b9", "spend:t:9");

        assertThat(currency.revokePurchase("tx-v1")).isTrue();
        assertThat(currency.revokePurchase("tx-v1")).isFalse();
        assertThat(currency.revokePurchase("tx-unknown")).isFalse();

        assertThat(currency.balance(user)).isEqualTo(-39);
        assertThat(ledgerSum(user)).isEqualTo(-39);
        // 빚이 있는 동안은 쓸 수 없다
        assertThatThrownBy(() -> currency.spend(user, 1, "EMOJI_SET", null, "spend:t:10"))
                .isInstanceOf(BusinessException.class);
    }

    /** 탈퇴 — 지갑·구매(users FK)와 원장(FK 없음)을 모두 거둔다. 빠뜨리면 FK 위반으로 탈퇴가 실패하거나 원장이 남는다. */
    @Test
    void 탈퇴하면_지갑_구매_원장이_모두_지워진다() {
        Long user = register("cur-purge@fitto.com");
        currency.grantPurchase(user, Store.GOOGLE_PLAY, "currency_39", "tx-p1", 39);
        currency.spend(user, 39, "EMOJI_SET", null, "spend:t:p");

        userDataPurger.purgeFor(user);

        for (String table : List.of("currency_wallets", "currency_store_purchases", "currency_ledger")) {
            Number n = (Number) em.createNativeQuery("select count(*) from " + table + " where user_id = :u")
                    .setParameter("u", user).getSingleResult();
            assertThat(n.longValue()).as(table).isZero();
        }
    }

    @Test
    void 카탈로그는_이모지_세트를_39로_판다() {
        assertThat(currency.priceOf(ShopItem.EMOJI_SET)).isEqualTo(39);
        assertThatThrownBy(() -> currency.priceOf("NOPE"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.SHOP_ITEM_UNAVAILABLE);
    }
}
