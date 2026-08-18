package com.fitto.diet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 끼니를 이루는 음식 하나 — 이름·양·칼로리·매크로. {@link Meal} 에 속한다.
 * 즐겨찾기의 {@code FavoriteFood}/{@code FavoriteFoodItem} 구조를 미러링한다.
 */
@Entity
@Table(name = "meal_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MealItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meal_id", nullable = false)
    private Meal meal;

    @Column(nullable = false, length = 100)
    private String name;

    /** 대략적인 양 — "1인분", "밥 반 공기". AI 추정치이거나 사용자가 적은 값 */
    @Column(length = 50)
    private String portion;

    private Integer calories;
    private Integer carbs;
    private Integer protein;
    private Integer fat;

    @Column(name = "order_no", nullable = false)
    private Integer orderNo;

    @Builder
    private MealItem(String name, String portion, Integer calories, Integer carbs,
                     Integer protein, Integer fat, Integer orderNo) {
        this.name = name;
        this.portion = portion;
        this.calories = calories;
        this.carbs = carbs;
        this.protein = protein;
        this.fat = fat;
        this.orderNo = orderNo != null ? orderNo : 0;
    }

    void assignTo(Meal meal) {
        this.meal = meal;
    }
}
