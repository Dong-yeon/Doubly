package com.fitto.diet.dto;

import java.util.List;

/**
 * 식단 통계.
 *
 * <p><b>두 층으로 나뉜다.</b> 위쪽(기록일 수 · 최근 7일)은 무료다 — 앱을 왜 쓰는지 보여주는
 * 최소한의 피드백이라 막으면 기록할 이유가 사라진다. 아래 {@code deep}(30일 매크로 달성률 ·
 * 나트륨·당 추이)은 {@code Feature.FULL_STATS} 로 열린다.
 *
 * <p>잠겼을 때 402 를 던지지 않고 {@code locked} 만 내려주는 이유: 통계 화면은 사용자가
 * 들어오면 <b>자동으로</b> 부르는 조회다. 여기서 402 가 나가면 화면을 열 때마다 업그레이드
 * 시트가 뜬다({@code MemoriesService}·{@code SummaryService} 와 같은 규칙).
 *
 * @param locked 심화 통계가 잠겨 있는지 — {@code true} 면 {@code deep} 은 {@code null}
 */
public record MealStatsResponse(
        int weeklyDays,
        int monthlyDays,
        long totalDays,
        List<DayStat> last7Days,
        boolean locked,
        DeepStats deep
) {
    /** 최근 7일 — 무료 구간. 단백질은 커플 앱에서 가장 자주 보는 매크로라 여기에 함께 둔다. */
    public record DayStat(String date, String weekday, boolean completed, int calories, int protein) {
    }

    /**
     * 심화 통계 (PRO).
     *
     * @param last30Days 30일 일별 영양소 — 히트맵·추이 그래프의 원본
     * @param targets    목표치. 미설정이면 {@code null} — 달성률 대신 절대량만 그린다
     */
    public record DeepStats(List<DayNutrition> last30Days, NutritionTargets targets) {
    }

    /** 하루치 영양소 합계 — 기록이 없는 날도 0으로 채워 보낸다(달력 격자가 비지 않도록). */
    public record DayNutrition(
            String date,
            int calories,
            int protein,
            int carbs,
            int fat,
            int sugar,
            /** 나트륨(mg) — g 단위인 다른 값과 달리 mg */
            int sodium
    ) {
    }

    public record NutritionTargets(Integer calories, Integer protein, Integer carbs, Integer fat) {
        public boolean isEmpty() {
            return calories == null && protein == null && carbs == null && fat == null;
        }
    }
}
