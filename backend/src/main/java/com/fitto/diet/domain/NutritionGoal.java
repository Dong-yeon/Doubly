package com.fitto.diet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 영양 목표 — 사용자별 하루 목표 칼로리/매크로. user_id 가 PK(사용자당 1개).
 */
@Entity
@Table(name = "nutrition_goals")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NutritionGoal {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "target_calories")
    private Integer targetCalories;

    @Column(name = "target_carbs")
    private Integer targetCarbs;

    @Column(name = "target_protein")
    private Integer targetProtein;

    @Column(name = "target_fat")
    private Integer targetFat;

    /** 하루 물 섭취 목표(ml) — 미설정 시 서비스 레이어 기본값(2000ml)을 쓴다 */
    @Column(name = "target_water_ml")
    private Integer targetWaterMl;

    public NutritionGoal(Long userId) {
        this.userId = userId;
    }

    public void update(Integer calories, Integer carbs, Integer protein, Integer fat) {
        this.targetCalories = calories;
        this.targetCarbs = carbs;
        this.targetProtein = protein;
        this.targetFat = fat;
    }

    public void updateWaterGoal(Integer targetWaterMl) {
        this.targetWaterMl = targetWaterMl;
    }
}
