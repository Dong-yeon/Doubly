package com.fitto.feed.domain;

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
 * 커플 일상 포스트 — PLAN.md Couple Feed. 글/사진 중 하나는 필수(서비스 검증).
 */
@Entity
@Table(name = "feed_posts")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FeedPost {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(columnDefinition = "text")
    private String content;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    /** 담긴 여행 앨범 (PLAN.md Trip Album) — 미연결 시 null */
    @Column(name = "trip_id")
    private Long tripId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private FeedPost(Long coupleId, Long authorId, String content, String imageUrl) {
        this.coupleId = coupleId;
        this.authorId = authorId;
        this.content = content;
        this.imageUrl = imageUrl;
    }

    /** 여행 앨범에 담기 / 빼기(null) */
    public void assignTrip(Long tripId) {
        this.tripId = tripId;
    }
}
