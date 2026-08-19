package com.fitto.workout.dto;

import com.fitto.workout.domain.ExerciseCatalog;

/** 종목 카탈로그 응답 — 자극 부위/기구 태그 포함. 대체 종목 후보·자동완성·세션 TIP 카드에 사용. */
public record ExerciseCatalogResponse(
        Long id,
        String name,
        String category,
        String muscleGroup,
        String equipment,
        String tip
) {
    public static ExerciseCatalogResponse of(ExerciseCatalog e) {
        return new ExerciseCatalogResponse(e.getId(), e.getName(), e.getCategory(),
                e.getMuscleGroup(), e.getEquipment(), e.getTip());
    }
}
