package com.fitto.feed.service;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 추억 리마인드의 날짜 규칙 (PLAN.md Memories) — 순수 단위 테스트.
 *
 * <p><b>이 테스트가 시간대 안전망의 본체다.</b> 통합 테스트는 JVM 기본 TZ 를 따라가므로,
 * KST 머신에서는 UTC 저장 경로가 아예 실행되지 않는다. 여기서는 저장 TZ 를 명시적으로
 * 넘겨 UTC·KST 양쪽을 모두 고정한다.
 */
class MemoryDatesTest {

    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // ---- 윤년 규칙 ----

    @Test
    void 평년에는_2월_29일이_2월_28일로_당겨진다() {
        assertThat(MemoryDates.occurrenceIn(2025, LocalDate.of(2028, 2, 29)))
                .isEqualTo(LocalDate.of(2025, 2, 28));
    }

    @Test
    void 윤년에는_2월_29일이_그대로다() {
        assertThat(MemoryDates.occurrenceIn(2024, LocalDate.of(2028, 2, 29)))
                .isEqualTo(LocalDate.of(2024, 2, 29));
    }

    /**
     * 역방향 보정 — 이게 없으면 윤년 2/29 에 남긴 기록이 4년에 한 번만 보인다.
     */
    @Test
    void 평년_2월_28일에는_윤년의_2월_29일도_함께_읽는다() {
        LocalDate today = LocalDate.of(2026, 2, 28);   // 2026 은 평년
        assertThat(today.isLeapYear()).isFalse();

        assertThat(MemoryDates.occurrencesIn(2024, today))   // 2024 는 윤년
                .containsExactly(LocalDate.of(2024, 2, 28), LocalDate.of(2024, 2, 29));
    }

    /**
     * 오늘이 윤년의 2/28 이면 2/29 는 "내일"이다 — 오늘의 추억으로 당겨오면 안 된다.
     */
    @Test
    void 윤년_2월_28일에는_2월_29일을_당겨오지_않는다() {
        LocalDate today = LocalDate.of(2028, 2, 28);   // 2028 은 윤년
        assertThat(today.isLeapYear()).isTrue();

        assertThat(MemoryDates.occurrencesIn(2024, today))
                .containsExactly(LocalDate.of(2024, 2, 28));
    }

    @Test
    void 평범한_날짜는_같은_월일_하나뿐이다() {
        assertThat(MemoryDates.occurrencesIn(2023, LocalDate.of(2026, 7, 30)))
                .containsExactly(LocalDate.of(2023, 7, 30));
    }

    // ---- 시간대 보정 ----

    /**
     * 운영(Railway=UTC) — KST 하루의 시작은 전날 15:00 의 벽시계로 적혀 있다.
     * 보정하지 않으면 KST 00:00~09:00 에 남긴 기록을 통째로 놓친다.
     */
    @Test
    void UTC_저장이면_KST_하루가_전날_15시부터다() {
        assertThat(MemoryDates.storageStartOfDay(LocalDate.of(2025, 7, 30), UTC))
                .isEqualTo(LocalDateTime.of(2025, 7, 29, 15, 0));
    }

    /** 로컬(Windows=KST) — 보정이 항등이라 그대로 자정이다. */
    @Test
    void KST_저장이면_보정이_항등이다() {
        assertThat(MemoryDates.storageStartOfDay(LocalDate.of(2025, 7, 30), KST))
                .isEqualTo(LocalDateTime.of(2025, 7, 30, 0, 0));
    }

    /** 하루 범위 [from, to) 는 저장 TZ 와 무관하게 정확히 24시간이다. */
    @Test
    void 하루_범위는_항상_24시간이다() {
        LocalDate day = LocalDate.of(2025, 7, 30);
        for (ZoneId zone : List.of(UTC, KST)) {
            LocalDateTime from = MemoryDates.storageStartOfDay(day, zone);
            LocalDateTime to = MemoryDates.storageStartOfDay(day.plusDays(1), zone);
            assertThat(Duration.between(from, to).toHours()).isEqualTo(24);
        }
    }
}
