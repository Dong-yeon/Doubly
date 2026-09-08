package com.fitto.mood.domain;

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
 * 무드 상태 — 관계별 로그(daily_answers 와 같은 모양). "지금 상태"는 최신 행으로 조회한다.
 * UNIQUE 제약이 없다 — 무드는 하루에 여러 번 바뀔 수 있어야 하므로 매번 새 행을 쌓는다(원장 방식).
 * PLAN.md "무드 상태 (Mood Status — Obimy 벤치마킹)" 참고.
 */
@Entity
@Table(name = "mood_statuses")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MoodStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /**
     * 유니코드 무드. 우리 이모지를 고른 경우에도 감정에 대응하는 값이 함께 저장된다
     * ({@code CoupleEmojiEmotion.moodEmoji()}) — 이 컬럼은 NOT NULL 이고 푸시 미리보기가
     * 그대로 읽는다(V81 주석).
     */
    @Column(nullable = false, length = 10)
    private String emoji;

    /**
     * 우리 이모지로 무드를 걸었을 때 그 이모지(V81). null 이면 위 {@link #emoji} 를 그린다.
     *
     * <p><b>URL 을 복사해 두지 않고 참조만 두는 게 핵심이다.</b> 채팅 메시지는 반대로 URL 을
     * 복사하는데(지난 메시지가 조인 없이, 숨긴 뒤에도 그려져야 해서), 무드는 그러면 안 된다 —
     * 상대가 "내 얼굴 그만 써" 하고 이모지를 지웠는데 홈 화면 배지로 하루 종일 남아 있으면
     * 설계 메모 §9 의 약속이 깨진다. 참조만 두면 읽을 때 숨김 여부를 확인해 유니코드로 되돌릴 수 있다
     * ({@code MoodService.current}).
     */
    @Column(name = "couple_emoji_id")
    private Long coupleEmojiId;

    @Column(length = 20)
    private String message;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private MoodStatus(Long coupleId, Long userId, String emoji, Long coupleEmojiId, String message) {
        this.coupleId = coupleId;
        this.userId = userId;
        this.emoji = emoji;
        this.coupleEmojiId = coupleEmojiId;
        this.message = message;
    }
}
