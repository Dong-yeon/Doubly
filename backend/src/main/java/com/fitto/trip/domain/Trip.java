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

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 커플 여행 — PLAN.md Trip. 커플(relations) 단위 공유, 장소(places)를 그룹핑한다.
 */
@Entity
@Table(name = "trips")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Trip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "cover_image_url", length = 500)
    private String coverImageUrl;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Trip(Long coupleId, String title, LocalDate startDate, LocalDate endDate,
                 String memo, String coverImageUrl, Long createdBy) {
        this.coupleId = coupleId;
        this.title = title;
        this.startDate = startDate;
        this.endDate = endDate;
        this.memo = memo;
        this.coverImageUrl = coverImageUrl;
        this.createdBy = createdBy;
    }

    /** 부분 수정 — null 이 아닌 값만 반영 (커플 둘 다 수정 가능) */
    public void update(String title, LocalDate startDate, LocalDate endDate,
                       String memo, String coverImageUrl) {
        if (title != null) this.title = title;
        if (startDate != null) this.startDate = startDate;
        if (endDate != null) this.endDate = endDate;
        if (memo != null) this.memo = memo;
        if (coverImageUrl != null) this.coverImageUrl = coverImageUrl;
    }
}
