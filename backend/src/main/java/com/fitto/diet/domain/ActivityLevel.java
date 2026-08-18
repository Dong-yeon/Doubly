package com.fitto.diet.domain;

/**
 * 활동량 — 목표 칼로리 자동 계산(TDEE) 마법사 입력. BMR 에 곱해 하루 총 소비 칼로리를 추정한다.
 * 배수는 Harris-Benedict/Mifflin 계열 계산기에서 통용되는 값(운동 여부 기준, 직업 활동량은 별도 반영 안 함).
 */
public enum ActivityLevel {
    /** 운동을 거의 안 함 */
    SEDENTARY(1.2),
    /** 주 1~3회 가벼운 운동 */
    LIGHT(1.375),
    /** 주 3~5회 보통 강도 운동 */
    MODERATE(1.55),
    /** 주 6~7회 활발한 운동 */
    ACTIVE(1.725),
    /** 매일 강한 운동 또는 육체노동 */
    VERY_ACTIVE(1.9);

    private final double multiplier;

    ActivityLevel(double multiplier) {
        this.multiplier = multiplier;
    }

    public double multiplier() {
        return multiplier;
    }
}
