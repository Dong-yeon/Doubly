package com.fitto.body.domain;

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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 신체 측정 기록 — 체중·체지방·둘레 + 진행 사진(before/after). 사용자별.
 */
@Entity
@Table(name = "body_metrics")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BodyMetric {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "measured_date", nullable = false)
    private LocalDate measuredDate;

    @Column(name = "weight_kg", precision = 5, scale = 2)
    private BigDecimal weightKg;

    @Column(name = "body_fat_pct", precision = 4, scale = 1)
    private BigDecimal bodyFatPct;

    @Column(name = "waist_cm", precision = 5, scale = 1)
    private BigDecimal waistCm;

    @Column(name = "photo_url", length = 500)
    private String photoUrl;

    @Column(columnDefinition = "text")
    private String memo;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private BodyMetric(Long userId, LocalDate measuredDate, BigDecimal weightKg, BigDecimal bodyFatPct,
                       BigDecimal waistCm, String photoUrl, String memo) {
        this.userId = userId;
        this.measuredDate = measuredDate != null ? measuredDate : LocalDate.now();
        this.weightKg = weightKg;
        this.bodyFatPct = bodyFatPct;
        this.waistCm = waistCm;
        this.photoUrl = photoUrl;
        this.memo = memo;
    }
}
