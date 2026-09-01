package com.fitto.workout.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 한 종목의 기록 추이 — "내가 이 종목에서 세지고 있나"에 답하는 데이터.
 *
 * <p><b>왜 만들었나</b>: 기존 통계는 "며칠 운동했나"만 보여줬다. 기록 앱을 계속 쓰는 이유는
 * 기록 자체가 아니라 기록이 만들어주는 <b>추이</b>인데, 넣기만 하고 돌려주는 게 없었다
 * (docs/WORKOUT_UX_ANALYSIS_2026-09-01.md 2순위).
 *
 * @param exerciseName 종목명
 * @param sessions     오래된 순 — 그래프가 왼쪽에서 오른쪽으로 흐르게
 * @param best         전 기간 개인 최고 기록. sessions 창(최근 N회) 밖의 기록도 포함한다
 */
public record ExerciseHistoryResponse(
        String exerciseName,
        List<Session> sessions,
        Best best
) {

    /**
     * 한 번의 수행.
     *
     * @param maxWeightKg     그날 든 가장 무거운 무게
     * @param totalVolumeKg   무게 × 횟수 총합 — "얼마나 많이 했나"
     * @param bestE1rmKg      그날의 최고 추정 1RM — 무게와 횟수를 한 숫자로 합친 값이라
     *                        무게만 보는 것보다 컨디션 변화를 덜 타고 추세가 잘 보인다
     * @param totalSets       완료한 세트 수
     */
    public record Session(
            LocalDate workoutDate,
            BigDecimal maxWeightKg,
            BigDecimal totalVolumeKg,
            BigDecimal bestE1rmKg,
            int totalSets
    ) {}

    /** 전 기간 최고 기록 — 각각 다른 날일 수 있다. */
    public record Best(
            BigDecimal maxWeightKg,
            BigDecimal maxVolumeKg,
            BigDecimal maxE1rmKg
    ) {}

    public static ExerciseHistoryResponse empty(String exerciseName) {
        return new ExerciseHistoryResponse(exerciseName, List.of(), new Best(null, null, null));
    }
}
