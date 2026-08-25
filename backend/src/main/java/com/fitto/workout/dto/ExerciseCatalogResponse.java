package com.fitto.workout.dto;

import com.fitto.workout.domain.ExerciseCatalog;

/** 종목 카탈로그 응답 — 자극 부위/기구 태그 포함. 대체 종목 후보·자동완성·세션 TIP 카드에 사용. */
public record ExerciseCatalogResponse(
        Long id,
        String name,
        String category,
        String muscleGroup,
        String equipment,
        // "이게 무슨 동작인지" 한 줄 설명 — tip(자세 교정 큐)과 달리 그 운동을 처음 보는 사람이 대상
        String description,
        String tip,
        // 이 종목이 뭔지 한눈에 보여주는 이모지 — 세션 카드 종목명 옆에 노출
        String emoji,
        // 언제 숨을 내쉬고 마시는지 — TIP 카드에 자세 큐와 함께 항상 붙는다
        String breathingCue
) {
    public static ExerciseCatalogResponse of(ExerciseCatalog e) {
        return new ExerciseCatalogResponse(e.getId(), e.getName(), e.getCategory(),
                e.getMuscleGroup(), e.getEquipment(), e.getDescription(), e.getTip(), e.getEmoji(),
                e.getBreathingCue());
    }
}
