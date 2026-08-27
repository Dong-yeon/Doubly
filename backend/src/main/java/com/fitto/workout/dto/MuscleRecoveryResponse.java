package com.fitto.workout.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 근육 회복 현황 — 부위별로 마지막 수행 시각 기준 경과 시간·추정 회복률을 계산한다.
 * 새 테이블 없이 기존 workout_sets.muscle_group + workouts.created_at 만 집계한 값이라
 * 별도로 저장되는 데이터는 없다(MuscleRecoveryService 참고).
 *
 * <p><b>두 층으로 나뉜다.</b> {@code mostRecent}(홈 화면 요약 한 줄)는 무료다 — 앱을 왜
 * 쓰는지 보여주는 최소한의 피드백이라 막으면 기록할 이유가 사라진다. 부위별 전체 카드인
 * {@code muscles}는 {@code Feature.WORKOUT_RECOVERY_FULL}로 열린다.
 *
 * <p>잠겼을 때 402를 던지지 않고 {@code locked}만 내려주는 이유: 이 조회는 화면에
 * 들어오면 자동으로 부르는 조회다({@code MealStatsResponse}와 같은 규칙).
 *
 * @param locked 부위별 전체 카드가 잠겨 있는지 — {@code true}면 {@code muscles}는 빈 리스트
 */
public record MuscleRecoveryResponse(
        List<MuscleRecovery> muscles,
        /** 가장 최근에 훈련한 부위 — 홈 화면 요약 카드("하체 · 6시간 전")용. 아무 기록도 없으면 null */
        MuscleRecovery mostRecent,
        boolean locked
) {
    public record MuscleRecovery(
            String muscleGroup,
            /** 한 번도 안 한 부위면 null */
            LocalDateTime lastTrainedAt,
            /** 한 번도 안 한 부위면 null */
            Long hoursAgo,
            /** 0~100. 한 번도 안 한 부위는 100(바로 해도 되는 상태로 취급) */
            int recoveryPercent
    ) {
    }
}
