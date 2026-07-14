package com.fitto.diet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 식단 기록 — 끼니별 사진/메모/칼로리. created_at 만 존재하므로 BaseTimeEntity 미상속.
 */
@Entity
@Table(name = "meals")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Meal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "meal_date", nullable = false)
    private LocalDate mealDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private MealType mealType;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "photo_url", columnDefinition = "text")
    private String photoUrl;

    private Integer calories;

    /** 매크로(g) — AI 분석/수동 입력. 목표 대비 남은 양 계산에 사용 */
    private Integer carbs;
    private Integer protein;
    private Integer fat;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Meal(Long userId, LocalDate mealDate, MealType mealType,
                String memo, String photoUrl, Integer calories,
                Integer carbs, Integer protein, Integer fat) {
        this.userId = userId;
        this.mealDate = mealDate;
        this.mealType = mealType;
        this.memo = memo;
        this.photoUrl = photoUrl;
        this.calories = calories;
        this.carbs = carbs;
        this.protein = protein;
        this.fat = fat;
    }
}
