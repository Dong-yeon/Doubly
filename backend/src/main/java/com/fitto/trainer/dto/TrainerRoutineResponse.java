package com.fitto.trainer.dto;

import com.fitto.trainer.domain.TrainerRoutine;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 트레이너 루틴 응답 — 설계서 5.7. trainerName 은 회원 화면 표시용(트레이너 조회 시 null 허용) */
public record TrainerRoutineResponse(
        Long id,
        Long relationId,
        Long trainerId,
        Long memberId,
        String title,
        String description,
        LocalDate routineDate,
        boolean isCompleted,
        LocalDateTime completedAt,
        String trainerName
) {
    public static TrainerRoutineResponse from(TrainerRoutine r, String trainerName) {
        return new TrainerRoutineResponse(r.getId(), r.getRelationId(), r.getTrainerId(), r.getMemberId(),
                r.getTitle(), r.getDescription(), r.getRoutineDate(),
                r.isCompleted(), r.getCompletedAt(), trainerName);
    }
}
