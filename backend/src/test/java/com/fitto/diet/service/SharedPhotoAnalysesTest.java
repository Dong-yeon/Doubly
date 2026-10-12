package com.fitto.diet.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 같은 사진 분석 공유 — "분석 중에 저장해도 한도는 한 번"(2026-10-12).
 * 여기서 {@code work} 실행 횟수가 곧 한도 차감·Gemini 호출 횟수다.
 */
class SharedPhotoAnalysesTest {

    private final AtomicLong now = new AtomicLong(1_000_000);
    private final SharedPhotoAnalyses<String> shared = new SharedPhotoAnalyses<>(Duration.ofMinutes(10), now::get);
    private final AtomicInteger runs = new AtomicInteger();

    private String run(String result) {
        runs.incrementAndGet();
        return result;
    }

    @Test
    void 분석_중에_같은_사진이_또_오면_올라타서_한_번만_돈다() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        // 앱이 붙이자마자 시작한 분석 — 아직 안 끝났다
        CompletableFuture<String> app = CompletableFuture.supplyAsync(() ->
                shared.getOrRun(1L, "u", null, () -> {
                    started.countDown();
                    await(release);
                    return run("김치찌개");
                }));
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        // 그 사이 저장 → 서버 자동 분석. 저장 때 장소가 새로 생겨 힌트가 달라도 진행 중이면 올라탄다.
        // 앱 분석은 잠시 뒤에 끝나게 하고, 자동 분석은 이 스레드에서 곧바로 부른다(앱이 먼저 끝나면 힌트가 달라 새로 돈다)
        CompletableFuture.runAsync(() -> {
            sleep(300);
            release.countDown();
        });
        String auto = shared.getOrRun(1L, "u", 77L, () -> run("다시 분석"));

        assertThat(app.get(5, TimeUnit.SECONDS)).isEqualTo("김치찌개");
        assertThat(auto).isEqualTo("김치찌개");
        assertThat(runs.get()).isEqualTo(1);
    }

    @Test
    void 막_끝난_결과는_같은_장소_힌트면_다시_돌지_않는다() {
        shared.getOrRun(1L, "u", 5L, () -> run("A"));
        assertThat(shared.getOrRun(1L, "u", 5L, () -> run("B"))).isEqualTo("A");
        assertThat(runs.get()).isEqualTo(1);
    }

    @Test
    void 끝난_뒤_장소를_바꿔_다시_누르면_힌트를_실어_새로_돈다() {
        shared.getOrRun(1L, "u", null, () -> run("A"));
        assertThat(shared.getOrRun(1L, "u", 5L, () -> run("B"))).isEqualTo("B");
        assertThat(runs.get()).isEqualTo(2);
    }

    @Test
    void 사람이나_사진이_다르면_공유하지_않는다() {
        shared.getOrRun(1L, "u", null, () -> run("A"));
        shared.getOrRun(2L, "u", null, () -> run("B"));
        shared.getOrRun(1L, "v", null, () -> run("C"));
        assertThat(runs.get()).isEqualTo(3);
    }

    @Test
    void 실패는_나눠_갖지_않는다_다음_호출이_새로_한다() {
        assertThatThrownBy(() -> shared.getOrRun(1L, "u", null, () -> {
            runs.incrementAndGet();
            throw new IllegalStateException("Gemini 503");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(shared.getOrRun(1L, "u", null, () -> run("A"))).isEqualTo("A");
        assertThat(runs.get()).isEqualTo(2);
    }

    @Test
    void 진행_중이던_분석이_실패하면_올라탄_쪽이_직접_한다() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CompletableFuture<String> app = CompletableFuture.supplyAsync(() ->
                shared.getOrRun(1L, "u", null, () -> {
                    started.countDown();
                    await(release);
                    throw new IllegalStateException("Gemini 503");
                }));
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<String> auto = CompletableFuture.supplyAsync(() ->
                shared.getOrRun(1L, "u", null, () -> run("자동 분석이 다시 함")));
        // auto 가 올라탄 뒤에 실패시키려고 잠깐 둔다 — 먼저 끝나도 결과는 같다(실패한 칸은 비워져 새로 돈다)
        Thread.sleep(100);
        release.countDown();

        assertThat(app).failsWithin(5, TimeUnit.SECONDS);
        assertThat(auto.get(5, TimeUnit.SECONDS)).isEqualTo("자동 분석이 다시 함");
    }

    @Test
    void 보관_시간이_지나면_다시_돌고_칸도_치워진다() {
        shared.getOrRun(1L, "u", null, () -> run("A"));
        now.addAndGet(Duration.ofMinutes(10).toMillis());
        assertThat(shared.getOrRun(1L, "u", null, () -> run("B"))).isEqualTo("B");
        assertThat(runs.get()).isEqualTo(2);

        now.addAndGet(Duration.ofMinutes(10).toMillis());
        shared.getOrRun(2L, "w", null, () -> run("C"));
        assertThat(shared.size()).isEqualTo(1);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
