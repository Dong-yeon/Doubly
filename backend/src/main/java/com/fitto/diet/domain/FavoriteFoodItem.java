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
 * 즐겨찾기 세트를 이루는 음식 하나 — 이름·칼로리·매크로. {@link FavoriteFood} 에 속한다
 * (운동 기록의 {@code Workout}/{@code WorkoutSet} 구조를 미러링).
 */
@Entity
@Table(name = "favorite_food_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FavoriteFoodItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "favorite_food_id", nullable = false)
    private FavoriteFood favoriteFood;

    @Column(nullable = false, length = 100)
    private String name;

    private Integer calories;
    private Integer carbs;
    private Integer protein;
    private Integer fat;

    @Column(name = "order_no", nullable = false)
    private Integer orderNo;

    @Builder
    private FavoriteFoodItem(String name, Integer calories, Integer carbs, Integer protein, Integer fat, Integer orderNo) {
        this.name = name;
        this.calories = calories;
        this.carbs = carbs;
        this.protein = protein;
        this.fat = fat;
        this.orderNo = orderNo != null ? orderNo : 0;
    }

    void assignTo(FavoriteFood favoriteFood) {
        this.favoriteFood = favoriteFood;
    }
}
