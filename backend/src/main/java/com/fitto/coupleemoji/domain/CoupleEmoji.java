package com.fitto.coupleemoji.domain;

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
 * 우리 이모지 한 장 — AI 가 사진 한 장으로 그린 감정별 캐릭터(V80).
 *
 * <p><b>소유는 관계다.</b> 만든 사람({@code createdBy})이 아니라 {@code relationId} 에 속한다 — 상대 얼굴을
 * 쓰는 기능이라 상대가 지울 수 있어야 동의 문제가 풀린다(docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §9).
 *
 * <p><b>삭제는 숨김이다.</b> 트레이에서 지워도 이미 보낸 채팅 메시지는 그대로 보여야 하므로
 * {@code deletedAt} 만 찍는다. 이미지 파일은 관계가 끝날 때({@code RelationRecordPurger}) 한꺼번에 지운다 —
 * 그래서 Purger 는 {@code deleted_at} 이 찍힌 행의 URL 도 모아야 한다.
 */
@Entity
@Table(name = "couple_emojis")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoupleEmoji {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    /** 누구 얼굴인가 — 상대가 기본, 내 얼굴도 가능 */
    @Column(name = "subject_user_id", nullable = false)
    private Long subjectUserId;

    /** 같은 생성에서 나온 묶음 — 세트 통째 삭제·미리보기 그룹핑용 */
    @Column(name = "batch_id", nullable = false, length = 36)
    private String batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CoupleEmojiEmotion emotion;

    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    @Column(name = "prompt_version", nullable = false, length = 20)
    private String promptVersion;

    /** 텍스트 모델이 뽑은 외형 사실 — 재생성·디버깅 때 같은 사실을 다시 쓴다 */
    @Column(name = "identity_facts", length = 500)
    private String identityFacts;

    /**
     * 무드 피커에 올릴 것인가 — 초기값은 감정이 정한다({@link CoupleEmojiEmotion#defaultMoodVisible}).
     * 삭제(deletedAt)와 별개다: 트레이에는 그대로 있고 무드 선택지에서만 빠진다.
     */
    @Column(name = "mood_visible", nullable = false)
    private boolean moodVisible;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private CoupleEmoji(Long relationId, Long createdBy, Long subjectUserId, String batchId,
                        CoupleEmojiEmotion emotion, String imageUrl, String promptVersion,
                        String identityFacts) {
        this.relationId = relationId;
        this.createdBy = createdBy;
        this.subjectUserId = subjectUserId;
        this.batchId = batchId;
        this.emotion = emotion;
        this.imageUrl = imageUrl;
        this.promptVersion = promptVersion;
        this.identityFacts = identityFacts;
        this.moodVisible = emotion != null && emotion.defaultMoodVisible();
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /** 무드 선택지에 올릴지 바꾼다 — 트레이 노출·삭제와는 무관하다 */
    public void setMoodVisible(boolean visible) {
        this.moodVisible = visible;
    }

    /** 트레이에서 숨긴다 — 클래스 주석 "삭제는 숨김이다" 참고 */
    public void hide() {
        if (deletedAt == null) {
            deletedAt = LocalDateTime.now();
        }
    }
}
