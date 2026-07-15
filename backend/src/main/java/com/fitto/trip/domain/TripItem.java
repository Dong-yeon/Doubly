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

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 커플 여행 일정 항목 — PLAN.md Trip Itinerary. 여행(trip) 안에서 Day별·시간순으로 배치된다.
 * 장소(place) 연결은 선택이라, 저장 장소 없이도 "공항 도착" 같은 자유 항목을 넣을 수 있다.
 */
@Entity
@Table(name = "trip_items")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    /** 연결 장소 — 없으면 자유 항목 */
    @Column(name = "place_id")
    private Long placeId;

    @Column(name = "day_no", nullable = false)
    private int dayNo;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(length = 30)
    private String category;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TripItem(Long tripId, Long placeId, int dayNo, int sortOrder, LocalTime startTime,
                     String title, String category, String memo, Long createdBy) {
        this.tripId = tripId;
        this.placeId = placeId;
        this.dayNo = dayNo;
        this.sortOrder = sortOrder;
        this.startTime = startTime;
        this.title = title;
        this.category = category;
        this.memo = memo;
        this.createdBy = createdBy;
    }

    /** 부분 수정 — null 이 아닌 값만 반영 (커플 둘 다 수정 가능) */
    public void update(String title, LocalTime startTime, String category, String memo) {
        if (title != null) this.title = title;
        if (startTime != null) this.startTime = startTime;
        if (category != null) this.category = category;
        if (memo != null) this.memo = memo;
    }

    /** 순서 이동 — Day 이동 + 하루 안 위치 재배치 */
    public void moveTo(int dayNo, int sortOrder) {
        this.dayNo = dayNo;
        this.sortOrder = sortOrder;
    }
}
