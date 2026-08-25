package com.fitto.content.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 커플 콘텐츠 — 영화·공연·드라마/OTT. PLAN.md Place Map 과 별개 도메인이다.
 *
 * <p><b>왜 Place 가 아닌가</b>: 럽슐랭 등급 엔진(둘 다 평가 → 등급 산정)은 좌표·카테고리와
 * 무관하지만, 지도·카카오 검색·AI 데이트 코스는 전부 좌표를 전제로 짜여 있다. 좌표 없는
 * 행을 Place 에 섞으면 그 코드 전반에 null 특수처리가 번진다 — 그래서 등급 산정 로직만
 * ({@link com.fitto.content.service.ContentService#computeTier}, PlaceService.computeTier 와
 * 동일 규칙) 그대로 미러링하고 나머지는 독립된 도메인으로 분리한다(2026-08-24 결정).
 */
@Entity
@Table(name = "contents")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Content {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(nullable = false, length = 100)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ContentType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ContentStatus status;

    @Column(name = "added_by", nullable = false)
    private Long addedBy;

    /** 포스터 이미지 — TMDB 검색으로 채워지거나(제목 직접 입력 시 null) 비어 있을 수 있다 */
    @Column(name = "poster_url", length = 500)
    private String posterUrl;

    /** 럽슐랭 등급 — 0=후보/일반, 1~3=럽스타. Place.lovelichelinTier 와 같은 규칙 */
    @Column(name = "lovelichelin_tier", nullable = false)
    private Integer lovelichelinTier = 0;

    /** 럽슐랭 등극(0→양수로 전환) 시각 — 재평가로 탈락하면 다시 null */
    @Column(name = "lovelichelin_certified_at")
    private LocalDateTime lovelichelinCertifiedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Content(Long coupleId, String title, ContentType type, ContentStatus status, Long addedBy,
                    String posterUrl) {
        this.coupleId = coupleId;
        this.title = title;
        this.type = type != null ? type : ContentType.MOVIE;
        this.status = status != null ? status : ContentStatus.WISHLIST;
        this.addedBy = addedBy;
        this.posterUrl = posterUrl;
    }

    /** 부분 수정 — null 이 아닌 값만 반영 (커플 둘 다 수정 가능) */
    public void update(String title, ContentType type, ContentStatus status, String posterUrl) {
        if (title != null) this.title = title;
        if (type != null) this.type = type;
        if (status != null) this.status = status;
        if (posterUrl != null) this.posterUrl = posterUrl;
    }

    /** 관람 기록이 생기면 자동으로 완료(봤어요) 전환 */
    public void markDone() {
        this.status = ContentStatus.DONE;
    }

    /** 럽슐랭 등급 갱신 — 나/상대 대표 평점이 바뀔 때마다 재산정되어 호출된다 */
    public void applyLovelichelinTier(int tier, LocalDateTime certifiedAt) {
        this.lovelichelinTier = tier;
        this.lovelichelinCertifiedAt = certifiedAt;
    }
}
