package com.fitto.place.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import com.fitto.common.time.KstClock;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 장소 방문 기록 — 사진·메모·별점(1~5)·식단 기록(meal) 연동.
 */
@Entity
@Table(name = "place_visits")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceVisit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "place_id", nullable = false)
    private Long placeId;

    @Column(name = "visited_by", nullable = false)
    private Long visitedBy;

    @Column(name = "visited_at", nullable = false)
    private LocalDate visitedAt;

    /** 별점 1~5 (선택) */
    private Integer rating;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    /** 식단 기록 연동 (선택) — meals.id */
    @Column(name = "meal_id")
    private Long mealId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private PlaceVisit(Long placeId, Long visitedBy, LocalDate visitedAt,
                       Integer rating, String memo, String imageUrl, Long mealId) {
        this.placeId = placeId;
        this.visitedBy = visitedBy;
        this.visitedAt = visitedAt != null ? visitedAt : KstClock.today();
        this.rating = rating;
        this.memo = memo;
        this.imageUrl = imageUrl;
        this.mealId = mealId;
    }
}
