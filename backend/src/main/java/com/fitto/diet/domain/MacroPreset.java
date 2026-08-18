package com.fitto.diet.domain;

/**
 * 매크로 비율 프리셋 — 목표 칼로리 자동 계산(TDEE 마법사)에서 탄단지 배분 방식을 고른다.
 * 단백질은 체중(kg) 기준 g/kg, 지방은 목표 칼로리 대비 비율로 정하고 탄수화물이 나머지를 채운다
 * (그래서 KETO 도 별도 계산식 없이 지방 비율만 높이면 탄수가 자연히 낮게 나온다).
 */
public enum MacroPreset {
    /** 균형 — 일반적인 체중 관리 기본값 */
    BALANCED(1.8, 0.25),
    /** 저탄고지 — 탄수 최소화, 지방 비중 확대 */
    LOW_CARB(2.0, 0.45),
    /** 고단백 — 근육 유지·성장 우선 */
    HIGH_PROTEIN(2.2, 0.25),
    /** 키토 — 지방 70%, 단백질은 절제(과다 섭취 시 케토시스 방해) */
    KETO(1.6, 0.70);

    /** 체중 1kg 당 목표 단백질(g) */
    private final double proteinPerKg;
    /** 목표 칼로리 중 지방이 차지하는 비율 */
    private final double fatRatio;

    MacroPreset(double proteinPerKg, double fatRatio) {
        this.proteinPerKg = proteinPerKg;
        this.fatRatio = fatRatio;
    }

    public double proteinPerKg() {
        return proteinPerKg;
    }

    public double fatRatio() {
        return fatRatio;
    }
}
