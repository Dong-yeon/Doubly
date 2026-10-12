package com.fitto.diet.service;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * 같은 사람·같은 사진의 분석을 한 번만 돌린다 — 진행 중이면 그 결과를 같이 기다리고, 막 끝났으면 그대로 돌려준다.
 *
 * <p><b>왜 필요한가</b> (2026-10-12): 기록 화면이 사진을 붙이자마자 분석을 시작하는데, 분석은 수 초~수십 초 걸린다.
 * 기다리기 싫은 사람이 그 사이 저장하면 서버 자동 분석(MealPhotoAutoAnalysisService)이 <b>같은 사진을 또</b>
 * 분석해 한도를 두 번 깎고 Gemini 도 두 번 부른다. 여기서 두 번째 호출이 첫 번째에 올라타게 해
 * "분석 중에도 저장"을 공짜로 만든다. 같은 사진을 버튼으로 다시 누른 경우(계측상 1주 3건)도 같은 이득을 본다.
 *
 * <ul>
 *   <li><b>올라탄 쪽은 한도를 쓰지 않는다</b> — {@code work} 를 실행하지 않으므로 그 안의 차감도 일어나지 않는다.
 *   <li><b>실패는 공유하지 않는다.</b> 앞선 분석이 실패했으면 올라탄 쪽이 직접 다시 한다(자동 분석이 사용자 대신
 *       재시도하는 셈). 실패한 칸은 바로 비워 다음 호출이 새로 시작한다.
 *   <li><b>끝난 결과는 장소 힌트가 같을 때만 재사용</b>한다 — 장소를 고르고 다시 누르면 힌트를 실은 새 분석이 맞다.
 *       진행 중인 분석에는 힌트가 달라도 올라탄다: 저장 때 카카오 장소가 새로 만들어지면 id 가 생겨 힌트가
 *       달라 보이지만 같은 끼니라, 거기서 갈라지면 한도를 두 번 쓴다.
 *   <li>인스턴스 메모리라 서버가 여러 대면 대 사이에서는 공유되지 않는다(지금 Railway 는 한 대). 재배포로 사라져도
 *       잃는 건 절약뿐이다.
 * </ul>
 */
final class SharedPhotoAnalyses<V> {

    private record Key(Long userId, String photoUrl) {
    }

    private record Slot<V>(CompletableFuture<V> future, Long placeId, long startedAt) {
    }

    private final ConcurrentHashMap<Key, Slot<V>> slots = new ConcurrentHashMap<>();
    private final long keepMillis;
    private final LongSupplier clock;

    SharedPhotoAnalyses(Duration keep, LongSupplier clock) {
        this.keepMillis = keep.toMillis();
        this.clock = clock;
    }

    V getOrRun(Long userId, String photoUrl, Long placeId, Supplier<V> work) {
        long now = clock.getAsLong();
        sweep(now);
        Key key = new Key(userId, photoUrl);
        CompletableFuture<V> mine = new CompletableFuture<>();
        Slot<V> slot = slots.compute(key, (k, cur) ->
                cur != null && reusable(cur, placeId, now) ? cur : new Slot<>(mine, placeId, now));

        if (slot.future() != mine) {
            try {
                return slot.future().join();
            } catch (CompletionException | CancellationException e) {
                // 앞선 분석이 실패했다 — 실패는 나눠 갖지 않고 직접 한다(이때는 한도를 쓴다)
                return work.get();
            }
        }

        try {
            V result = work.get();
            mine.complete(result);
            return result;
        } catch (Throwable t) {
            slots.remove(key, slot);
            mine.completeExceptionally(t);
            throw t;
        }
    }

    private boolean reusable(Slot<V> slot, Long placeId, long now) {
        if (!slot.future().isDone()) return true;
        if (slot.future().isCompletedExceptionally()) return false;
        return now - slot.startedAt() < keepMillis && Objects.equals(slot.placeId(), placeId);
    }

    /** 끝났고 보관 시간이 지난 칸을 버린다 — 진행 중인 칸은 남긴다 */
    private void sweep(long now) {
        slots.values().removeIf(s -> s.future().isDone() && now - s.startedAt() >= keepMillis);
    }

    int size() {
        return slots.size();
    }
}
