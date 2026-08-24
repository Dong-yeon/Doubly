package com.fitto.content.domain;

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
 * 콘텐츠 관람 기록 — 사진(스크린샷·티켓)·메모·별점(1~5). {@link com.fitto.place.domain.PlaceVisit}
 * 과 같은 패턴이나, 식단 연동(mealId)은 없다 — 영화·공연을 식단과 엮을 이유가 없어서다.
 */
@Entity
@Table(name = "content_logs")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ContentLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "content_id", nullable = false)
    private Long contentId;

    @Column(name = "logged_by", nullable = false)
    private Long loggedBy;

    @Column(name = "watched_at", nullable = false)
    private LocalDate watchedAt;

    /** 별점 1~5 (선택) */
    private Integer rating;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ContentLog(Long contentId, Long loggedBy, LocalDate watchedAt,
                       Integer rating, String memo, String imageUrl) {
        this.contentId = contentId;
        this.loggedBy = loggedBy;
        this.watchedAt = watchedAt != null ? watchedAt : KstClock.today();
        this.rating = rating;
        this.memo = memo;
        this.imageUrl = imageUrl;
    }
}
