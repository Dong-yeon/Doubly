package com.fitto.workout.dto;

import com.fitto.workout.domain.Workout;
import com.fitto.workout.domain.WorkoutSet;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 운동 기록 응답 — 설계서 5.5 / 5.6 */
public record WorkoutResponse(
        Long id,
        Long relationId,
        LocalDate workoutDate,
        Integer totalDurationMin,
        String memo,
        Long sourceRoutineId,
        List<SetResponse> sets,
        List<PrHighlight> prs,
        LocalDateTime createdAt
) {
    public record SetResponse(
            Long id,
            String exerciseName,
            String category,
            Integer sets,
            Integer reps,
            BigDecimal weightKg,
            Integer orderNo,
            Long exerciseCatalogId,
            String muscleGroup,
            String equipment,
            List<WorkoutSetEntryResponse> entries
    ) {
        static SetResponse from(WorkoutSet s) {
            return new SetResponse(s.getId(), s.getExerciseName(), s.getCategory(),
                    s.getSets(), s.getReps(), s.getWeightKg(), s.getOrderNo(),
                    s.getExerciseCatalogId(), s.getMuscleGroup(), s.getEquipment(),
                    s.getEntries().stream().map(WorkoutSetEntryResponse::of).toList());
        }
    }

    /**
     * PR(자기 최고 기록) 갱신 — <b>저장 시점에만</b> 계산해 그 응답에 싣는다.
     * 이후 같은 기록을 다시 조회할 때(오늘 목록·히스토리 등)는 항상 빈 목록이다.
     * "저장했을 때 PR이었다"는 일회성 알림이지, 기록에 영구히 붙는 상태가 아니기 때문이다
     * (나중에 더 무거운 기록이 생기면 과거 응답의 PR 표시가 거짓이 되므로 그때그때 계산한다).
     */
    public record PrHighlight(
            String exerciseName,
            BigDecimal weightKg,
            BigDecimal previousBestKg
    ) {}

    /** 저장 시점이 아닌 조회(오늘/히스토리 등)용 — PR 목록은 항상 비운다. */
    public static WorkoutResponse from(Workout w) {
        return from(w, List.of());
    }

    /** 저장 응답 전용 — 이번 저장에서 감지된 PR 목록을 함께 싣는다. */
    public static WorkoutResponse from(Workout w, List<PrHighlight> prs) {
        List<SetResponse> sets = w.getSets().stream().map(SetResponse::from).toList();
        return new WorkoutResponse(w.getId(), w.getRelationId(), w.getWorkoutDate(),
                w.getTotalDurationMin(), w.getMemo(), w.getSourceRoutineId(), sets, prs, w.getCreatedAt());
    }
}
