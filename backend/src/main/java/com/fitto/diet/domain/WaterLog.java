package com.fitto.diet.domain;

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
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 물 섭취 기록 — 날짜별 누적치 1행(user_id, log_date 유니크). 화면의 "+250ml" 버튼이
 * {@link #add(int)} 로 이 행을 증분한다. 별도 목표(target)는 {@code NutritionGoal.targetWaterMl}.
 */
@Entity
@Table(name = "water_logs")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WaterLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "log_date", nullable = false)
    private LocalDate logDate;

    @Column(name = "amount_ml", nullable = false)
    private int amountMl;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private WaterLog(Long userId, LocalDate logDate, int amountMl) {
        this.userId = userId;
        this.logDate = logDate;
        this.amountMl = amountMl;
    }

    /** amountMl 을 delta 만큼 증감한다. 0 아래로는 내려가지 않는다(마이너스 버튼으로 오남용 방지). */
    public void add(int deltaMl) {
        this.amountMl = Math.max(0, this.amountMl + deltaMl);
    }
}
