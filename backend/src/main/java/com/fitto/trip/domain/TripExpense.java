package com.fitto.trip.domain;

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
import java.time.LocalDateTime;

/**
 * 커플 여행 경비 — PLAN.md Trip Expenses. 누가(paidBy) 얼마(amount)를 냈는지 기록하고,
 * 정산은 서비스에서 커플 반반 기준으로 계산한다. (환율 미적용 — 단일 통화 가정)
 */
@Entity
@Table(name = "trip_expenses")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripExpense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(name = "paid_by", nullable = false)
    private Long paidBy;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(length = 30)
    private String category;

    @Column(name = "day_no")
    private Integer dayNo;

    @Column(length = 200)
    private String memo;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TripExpense(Long tripId, Long paidBy, BigDecimal amount, String currency,
                        String category, Integer dayNo, String memo, Long createdBy) {
        this.tripId = tripId;
        this.paidBy = paidBy;
        this.amount = amount;
        this.currency = currency != null ? currency : "KRW";
        this.category = category;
        this.dayNo = dayNo;
        this.memo = memo;
        this.createdBy = createdBy;
    }

    /** 부분 수정 — null 이 아닌 값만 반영 (커플 둘 다 가능) */
    public void update(Long paidBy, BigDecimal amount, String currency,
                       String category, Integer dayNo, String memo) {
        if (paidBy != null) this.paidBy = paidBy;
        if (amount != null) this.amount = amount;
        if (currency != null) this.currency = currency;
        if (category != null) this.category = category;
        if (dayNo != null) this.dayNo = dayNo;
        if (memo != null) this.memo = memo;
    }
}
