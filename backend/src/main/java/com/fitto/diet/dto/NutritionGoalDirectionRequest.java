package com.fitto.diet.dto;

import com.fitto.diet.domain.DietGoalType;

/** 목표 방향만 바꾼다 — 신체 정보 시트의 선택 칸. null 이면 미설정으로 되돌린다. */
public record NutritionGoalDirectionRequest(DietGoalType goalDirection) {
}
