package com.fitto.feed.domain;

import com.fitto.common.time.KstClock;
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

    /**
     * 기록일(KST) — 이 일이 있었던 날. 올린 시각({@link #createdAt})과 따로 둔다(V119): 어젯밤 일을 오늘
     * 아침 올려도 어제 기록이어야 사진첩·작년 오늘이 식단·운동·방문과 같은 기준으로 묶인다.
     * 타임라인은 여전히 올린 순서다 — 피드는 "방금 무엇이 올라왔나"다.
     */
    @Column(name = "record_date", nullable = false)
    private LocalDate recordDate;

    /** @param recordDate null 이면 오늘(KST) */
    @Builder
    private FeedPost(Long coupleId, Long authorId, String content, String imageUrl, LocalDate recordDate) {
        this.coupleId = coupleId;
        this.authorId = authorId;
        this.content = content;
        this.imageUrl = imageUrl;
        this.recordDate = recordDate != null ? recordDate : KstClock.today();
    }

    /** 고친 시각(V123) — 실제로 바뀐 적이 있으면 카드가 "수정됨"을 보여 준다. 없으면 null */
    @Column(name = "edited_at")
    private LocalDateTime editedAt;

    /**
     * 고치기 — 글·대표 사진·기록일을 바꾼다. 검증은 FeedService 가 한다(작성과 같은 규칙).
     * 바뀐 게 없으면 수정 시각을 찍지 않는다 — 저장만 다시 누른 글에 "수정됨"이 붙으면 거짓말이다.
     */
    public void edit(String content, String imageUrl, LocalDate recordDate, boolean changed) {
        this.content = content;
        this.imageUrl = imageUrl;
        this.recordDate = recordDate;
        if (changed) {
            this.editedAt = LocalDateTime.now();
        }
    }

    /** 여행 앨범에 담기 / 빼기(null) */
    public void assignTrip(Long tripId) {
        this.tripId = tripId;
    }
}
