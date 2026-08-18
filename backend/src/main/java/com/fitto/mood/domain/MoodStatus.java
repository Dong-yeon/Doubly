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

    @Column(nullable = false, length = 10)
    private String emoji;

    @Column(length = 20)
    private String message;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private MoodStatus(Long coupleId, Long userId, String emoji, String message) {
        this.coupleId = coupleId;
        this.userId = userId;
        this.emoji = emoji;
        this.message = message;
    }
}
