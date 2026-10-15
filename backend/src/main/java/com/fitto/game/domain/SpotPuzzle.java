package com.fitto.game.domain;

import com.fitto.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 틀린그림찾기 퍼즐 한 판(V143 {@code spot_puzzles}) — docs/spot-diff-design_2026-10-14.md.
 *
 * <p>행은 Spring 이 PENDING 으로 만들고, 이미지·정답·크기·시드는 Python worker 가 채운다(그래서 이 엔티티에는
 * 그 값을 쓰는 메서드가 없다). {@code layout_json} 은 <b>서버 전용</b>이다 — 응답으로 옮기는 곳은
 * 결과 공개 조건을 지나는 {@code SpotDiffService.toResponse} 뿐이다.
 *
 * <p>탭·힌트·열기는 모두 이 행을 잠그고({@code findByIdForUpdate}) 처리한다 — 두 사람의 풀이가 한 행에서 직렬화된다.
 */
@Entity
@Table(name = "spot_puzzles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SpotPuzzle extends BaseTimeEntity {

    public static final String EXPIRE_TIME = "TIME";
    public static final String EXPIRE_PHOTO_REMOVED = "PHOTO_REMOVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(name = "puzzle_date")
    private LocalDate puzzleDate;

    @Column(name = "source_type", length = 20)
    private String sourceType;

    @Column(name = "source_id")
    private Long sourceId;

    @Column(name = "source_url", length = 1000)
    private String sourceUrl;

    @Column(name = "image_a_url", length = 1000)
    private String imageAUrl;

    @Column(name = "image_b_url", length = 1000)
    private String imageBUrl;

    private Integer width;

    private Integer height;

    @Column(name = "layout_json", columnDefinition = "TEXT")
    private String layoutJson;

    private Long seed;

    @Column(length = 10)
    private String level;

    @Column(name = "generator_version", length = 20)
    private String generatorVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SpotPuzzleStatus status;

    @Column(name = "expire_reason", length = 20)
    private String expireReason;

    @Column(name = "fail_reason", length = 500)
    private String failReason;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "result_posted", nullable = false)
    private boolean resultPosted;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    public SpotPuzzle(Long coupleId, LocalDate puzzleDate, SpotPuzzleStatus status, LocalDateTime expiresAt) {
        this.coupleId = coupleId;
        this.puzzleDate = puzzleDate;
        this.status = status;
        this.expiresAt = expiresAt;
    }

    public boolean isReady() {
        return status == SpotPuzzleStatus.READY;
    }

    public boolean isExpired() {
        return status == SpotPuzzleStatus.EXPIRED;
    }

    /** 시간이 지났는가 — 정리 작업이 돌기 전이라도 판정은 이 값으로 한다 */
    public boolean isPastExpiry(LocalDateTime now) {
        return expiresAt != null && !now.isBefore(expiresAt);
    }

    public boolean isCompleted() {
        return completedAt != null;
    }

    /** 둘 다 다 찾았다 — 결과가 열린다 */
    public void complete(LocalDateTime at) {
        if (completedAt == null) completedAt = at;
    }

    /**
     * 만료. 사진이 사라진 경우({@link #EXPIRE_PHOTO_REMOVED})에는 이미지 주소도 비운다 — 주소를 남겨 두면
     * 삭제기의 참조 확인({@code StoredMediaReferences})이 "아직 쓰이는 파일"로 보고 지우지 않는다.
     * 시간으로 이미 만료된 판도 나중에 원본이 사라지면 이미지를 거둔다.
     *
     * @return 커밋 뒤 지워야 할 A/B 이미지 주소(사진 만료일 때만)
     */
    public List<String> expire(String reason) {
        List<String> drop = new ArrayList<>();
        if (status != SpotPuzzleStatus.EXPIRED) {
            status = SpotPuzzleStatus.EXPIRED;
            expireReason = reason;
        }
        if (EXPIRE_PHOTO_REMOVED.equals(reason)) {
            expireReason = reason;
            if (imageAUrl != null) drop.add(imageAUrl);
            if (imageBUrl != null) drop.add(imageBUrl);
            imageAUrl = null;
            imageBUrl = null;
        }
        return drop;
    }

    /**
     * 공유 사진이 모자람. 사유에 확인 시각을 넣는다 — 값이 바뀌어야 {@code updated_at} 이 갱신되고, 다시 시도하는
     * 간격({@code SpotDiffGenerator.NOT_ENOUGH_RETRY})이 그 값으로 잰다.
     */
    public void markNotEnoughPhotos(int candidates, LocalDateTime checkedAt) {
        status = SpotPuzzleStatus.NOT_ENOUGH_PHOTOS;
        failReason = "공유 사진 후보 " + candidates + "장 (" + checkedAt + ")";
    }

    /** 사진이 모자랐던 판을 다시 만들어 본다 — 그사이 사진을 올렸을 수 있다 */
    public void retryPending() {
        if (status == SpotPuzzleStatus.NOT_ENOUGH_PHOTOS) {
            status = SpotPuzzleStatus.PENDING;
        }
    }

    public void markResultPosted() {
        resultPosted = true;
    }
}
