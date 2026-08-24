package com.fitto.content.domain;

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

import java.time.LocalDateTime;

/**
 * 럽슐랭 대표 평점 — 콘텐츠 하나에 사용자 한 명당 딱 1개만 존재한다(재평가 시 upsert).
 * {@link com.fitto.place.domain.PlaceRating} 과 같은 패턴 — {@link ContentLog#getRating()}
 * (관람 기록별 별점)과는 별개 개념이다.
 */
@Entity
@Table(name = "content_ratings")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ContentRating {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "content_id", nullable = false)
    private Long contentId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 럽슐랭 대표 평점 1~5 */
    @Column(nullable = false)
    private Integer rating;

    /** "다시 볼래요?" — 선택 응답 */
    @Column(name = "revisit_intent")
    private Boolean revisitIntent;

    /** 마지막으로 평가/재평가한 시각 — 재평가하면 갱신된다 */
    @LastModifiedDate
    @Column(name = "rated_at", nullable = false)
    private LocalDateTime ratedAt;

    @Builder
    private ContentRating(Long contentId, Long userId, Integer rating, Boolean revisitIntent) {
        this.contentId = contentId;
        this.userId = userId;
        this.rating = rating;
        this.revisitIntent = revisitIntent;
    }

    /**
     * 재평가 — 별점은 항상 덮어쓴다(요청에서 필수값). revisitIntent 는 선택 응답이라
     * null 이면 "이번엔 응답 안 함"이지 "지운다"가 아니다 — PlaceRating.update 와 같은 이유.
     */
    public void update(Integer rating, Boolean revisitIntent) {
        this.rating = rating;
        if (revisitIntent != null) this.revisitIntent = revisitIntent;
    }
}
