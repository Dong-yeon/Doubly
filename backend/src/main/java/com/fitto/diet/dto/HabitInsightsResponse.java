package com.fitto.diet.dto;

import com.fitto.diet.domain.FastingEndReason;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 물·단식 리포트(2026-10-16, 무료 — FULL_STATS 를 거치지 않는다). 최근 {@code days.size()}일(KST) 기준.
 * 결정·문구 원칙은 docs/LOVEBODY_FASTING_WATER_ANALYSIS_2026-10-16.md §4: 몸속 일은 추정하지 않고 <b>본인 기록</b>만 숫자로.
 *
 * <p>단식은 <b>끝난 날</b>(KST)에 붙인다 — 저녁에 시작해 다음 날 아침에 끝나는 게 보통이라, 그날의 식사 기록과 짝이 맞는다.
 * 진행 중인 단식은 날짜 표에 넣지 않는다(아직 결과가 아니다).
 */
public record HabitInsightsResponse(
        LocalDate today,
        /** 지금의 물 목표 — 목표 변경 이력은 없어서 지난 날도 이 값으로 잰다 */
        int waterTargetMl,
        /** 오래된 날부터 오늘까지 */
        List<Day> days,
        /** 최근 7일(오늘 포함) */
        Week thisWeek,
        /** 그 앞 7일 */
        Week lastWeek,
        Comparison comparison,
        /** 가장 최근에 끝난 단식 — 없으면 null */
        LastFast lastFast,
        /** 목표를 채운 단식이 끝난 날이 며칠째 이어지나(오늘 아직 없으면 어제부터 센다) */
        int achievedStreak,
        /** 커플이 아니면 connected=false 이고 나머지는 0 */
        Couple couple
) {
    public record Day(
            LocalDate date,
            int waterMl,
            /** 그날 끝난 단식 중 가장 긴 것의 공복 시간(분), 없으면 null */
            Integer fastMin,
            boolean fastAchieved,
            /** 그날 식단 칼로리 합 — 칼로리가 적힌 기록이 하나도 없으면 null(0kcal 과 구분) */
            Integer calories,
            /** 그날 잰 체중(여러 번이면 마지막) — 본인에게만, 상대에게는 나가지 않는다 */
            BigDecimal weightKg,
            /** 상대가 그날 목표를 채웠나 — 커플이 아니면 null */
            Boolean partnerAchieved
    ) {}

    public record Week(
            int fastCount,
            int achievedCount,
            /** 끝난 단식의 평균 공복(분), 없으면 null */
            Integer avgFastMin,
            /** 물 목표를 채운 날 수 */
            int waterGoalDays,
            int avgWaterMl
    ) {}

    /**
     * 단식(목표 달성)한 날 vs 안 한 날의 하루 섭취 칼로리 — 칼로리 기록이 있는 날만.
     * enough=false 면 어느 한쪽이 {@code MIN_DAYS}일보다 적어 비교를 보여 주지 않는다(우연을 결론처럼 보이게 하지 않는다).
     */
    public record Comparison(
            boolean enough,
            int fastDays,
            Integer fastDayAvgCalories,
            int otherDays,
            Integer otherDayAvgCalories,
            /** 기간 안 체중 기록 수 — 2개 이상이어야 겹쳐 보기를 그린다 */
            int weightCount,
            /** 첫 체중 → 마지막 체중 변화(kg), 2개 미만이면 null */
            BigDecimal weightChangeKg
    ) {
        public static final int MIN_DAYS = 3;
    }

    public record LastFast(
            int elapsedMin,
            int targetHours,
            boolean achieved,
            LocalDateTime endedAt,
            FastingEndReason endedBy,
            /** 최근 7일 안에서 이 단식이 목표 달성 몇 번째인가 — 달성 못 했으면 0 */
            int achievedThisWeek
    ) {}

    public record Couple(
            boolean connected,
            String partnerName,
            /** 기간 안에 둘 다 목표를 채운 날 수 */
            int bothDays,
            /** 둘 다 채운 날이 며칠째 이어지나(오늘 아직이면 어제부터) */
            int bothStreak
    ) {
        public static Couple none() {
            return new Couple(false, null, 0, 0);
        }
    }
}
