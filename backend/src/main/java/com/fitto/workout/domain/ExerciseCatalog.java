package com.fitto.workout.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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

import java.time.LocalDateTime;

/**
 * 종목 카탈로그 — 자극 부위(muscleGroup)/기구(equipment) 태그의 출처.
 * 대체 종목 추천, 자극 부위 시각화, AI 추천 고도화가 모두 이 태그에 의존한다.
 * {@code createdBy} 가 null 이면 시스템 기본 제공 종목, 값이 있으면 사용자가 추가한 커스텀 종목.
 */
@Entity
@Table(name = "exercise_catalog")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExerciseCatalog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100, unique = true)
    private String name;

    @Column(nullable = false, length = 20)
    private String category;

    @Column(name = "muscle_group", nullable = false, length = 20)
    private String muscleGroup;

    @Column(length = 30)
    private String equipment;

    @Column(name = "created_by")
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ExerciseCatalog(String name, String category, String muscleGroup, String equipment, Long createdBy) {
        this.name = name;
        this.category = category;
        this.muscleGroup = muscleGroup;
        this.equipment = equipment;
        this.createdBy = createdBy;
    }
}
