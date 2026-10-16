package com.fitto.diet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

    /**
     * 목표 방향(감량·유지·증량) — null 이면 미설정. 본인 영양 요약에만 실린다(상대에게는 나가지 않는다).
     * 칼로리 링 문구("남았어요" / "더 드세요")와 마법사 기본값이 이 값을 본다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "goal_direction", length = 10)
    private DietGoalType goalDirection;

    /** 식사를 기록하면 진행 중인 단식을 자동으로 끝낼지(V145) — null 은 켜짐 */
    @Column(name = "fasting_auto_end")
    private Boolean fastingAutoEnd;

    /** 저녁을 기록하면 "단식 시작할까요?"를 물을지(V145) — null 은 켜짐 */
    @Column(name = "fasting_offer_dinner")
    private Boolean fastingOfferDinner;

    public NutritionGoal(Long userId) {
        this.userId = userId;
    }

    public void update(Integer calories, Integer carbs, Integer protein, Integer fat) {
        this.targetCalories = calories;
        this.targetCarbs = carbs;
        this.targetProtein = protein;
        this.targetFat = fat;
    }

    public void updateGoalDirection(DietGoalType goalDirection) {
        this.goalDirection = goalDirection;
    }

    public void updateWaterGoal(Integer targetWaterMl) {
        this.targetWaterMl = targetWaterMl;
    }

    public boolean fastingAutoEndOrDefault() {
        return fastingAutoEnd == null || fastingAutoEnd;
    }

    public boolean fastingOfferDinnerOrDefault() {
        return fastingOfferDinner == null || fastingOfferDinner;
    }

    /** null 인 값은 그대로 둔다(한쪽만 바꾸는 요청) */
    public void updateFastingSettings(Boolean autoEnd, Boolean offerDinner) {
        if (autoEnd != null) this.fastingAutoEnd = autoEnd;
        if (offerDinner != null) this.fastingOfferDinner = offerDinner;
    }
}
