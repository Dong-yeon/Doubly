package com.fitto.workout.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * 운동 통계 — 설계서 WORKOUT-07.
 *
 * <p><b>무료 구간과 심화 구간이 한 응답에 있다</b>({@code deep} 이 null 이면 잠김).
 * 식단 통계({@code MealStatsResponse})가 쓰는 모양 그대로다 — 잠겼다고 402 를 던지면
 * 화면이 통째로 못 뜬다. 자동으로 부르는 조회는 <b>잠김을 값으로 내려주고</b> 화면이
 * 그 자리에 안내를 그린다({@code PlanGuard.allows} 주석).
 */
public record WorkoutStatsResponse(
        int weeklyDays,   // 이번 주 운동한 날 수
        int monthlyDays,  // 이번 달 운동한 날 수
        long totalDays,   // 전체 운동한 날 수
        List<DayStat> last7Days,           // 최근 7일 완료 여부 (그래프)
        List<CategoryStat> categoryBreakdown, // 최근 30일 부위별 세트 수
        /** 심화 통계(PRO — {@code Feature.WORKOUT_V2_STATS}). 잠겨 있으면 null. */
        Deep deep
) {
    public record DayStat(String date, String weekday, boolean completed) {}

    public record CategoryStat(String category, long count) {}

    /**
     * 볼륨 · 추정 1RM · 부위 밸런스 — PRO 대표 기능 셋 중 하나({@code Feature.isHero()}).
     *
     * <p>위의 무료 구간에서 <b>아무것도 빼지 않았다</b>. 여기 있는 건 전부 새로 계산해
     * 얹은 값이다 — 쓰던 것을 뺏으면 새 상품이 아니라 기능 회수로 체감된다.
     */
    public record Deep(
            /** 최근 8주 주별 총 볼륨(kg) — 오래된 주가 먼저 */
            List<WeekVolume> weeklyVolume,
            /** 추정 1RM 상위 종목 — 많아야 5개 */
            List<TopLift> topLifts,
            /** 최근 30일 부위별 비중 — 많이 한 순 */
            List<MuscleShare> muscleBalance
    ) {}

    /** @param weekStart 그 주 월요일 (ISO yyyy-MM-dd) */
    public record WeekVolume(String weekStart, BigDecimal volumeKg) {}

    /**
     * @param bestE1rmKg Epley 추정 1RM — {@code w × (1 + reps/30)}.
     *                   {@code WorkoutService.estimate1RM} · 프론트 {@code estimate1RM} 과 같은 식이다
     */
    public record TopLift(String exerciseName, BigDecimal bestWeightKg, BigDecimal bestE1rmKg) {}

    /**
     * @param muscleGroup  세분 부위. 카탈로그를 안 거친 수기 입력은 category 로 떨어진다
     * @param sharePercent 전체 완료 세트 대비 비중(0~100, 소수점 한 자리)
     */
    public record MuscleShare(String muscleGroup, long setCount, BigDecimal sharePercent) {}
}
