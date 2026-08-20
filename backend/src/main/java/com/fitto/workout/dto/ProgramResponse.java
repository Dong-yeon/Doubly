package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutProgram;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 맞춤 프로그램 응답 — 요일별 Day 루틴을 하나로 묶어 내려준다("내 루틴" 목록의 프로그램 카드,
 * Day 선택 화면 둘 다 이 응답 하나로 그린다).
 */
public record ProgramResponse(
        Long id,
        String title,
        int totalWeeks,
        LocalDateTime createdAt,
        List<ProgramDay> days
) {
    public record ProgramDay(
            int dayNo,
            RoutineResponse routine
    ) {
    }

    public static ProgramResponse of(WorkoutProgram p) {
        return new ProgramResponse(p.getId(), p.getTitle(), p.getTotalWeeks(), p.getCreatedAt(),
                p.getRoutines().stream()
                        .map(r -> new ProgramDay(r.getDayNo(), RoutineResponse.of(r)))
                        .toList());
    }
}
