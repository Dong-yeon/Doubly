package com.fitto.diet.domain;

/** 식단 목표 방향 — 목표 칼로리 자동 계산(TDEE) 마법사 입력. */
public enum DietGoalType {
    /** 감량 — TDEE 에서 하루 섭취를 줄인다 */
    LOSE,
    /** 유지 — TDEE 그대로 */
    MAINTAIN,
    /** 증량 — TDEE 보다 하루 섭취를 늘린다 */
    GAIN
}
