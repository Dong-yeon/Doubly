package com.fitto.workout.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 근육 회복 현황 — 부위별로 마지막 수행 시각 기준 경과 시간·추정 회복률을 계산한다.
 * 새 테이블 없이 기존 workout_sets.muscle_group + workouts.created_at 만 집계한 값이라
 * 별도로 저장되는 데이터는 없다(MuscleRecoveryService 참고).
 */
public record MuscleRecoveryResponse(
        List<MuscleRecovery> muscles,
        /** 가장 최근에 훈련한 부위 — 홈 화면 요약 카드("하체 · 6시간 전")용. 아무 기록도 없으면 null */
        MuscleRecovery mostRecent
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
