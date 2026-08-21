package com.fitto.challenge.domain;

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

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 커플 챌린지/대결 — 기간 내 운동/식단 기록일로 겨룬다. 점수는 원본 기록에서 실시간 집계.
 */
@Entity
@Table(name = "couple_challenges")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoupleChallenge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ChallengeType type;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(columnDefinition = "text")
    private String stake;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * 종료 판정 시각 — 채워져 있으면 결과 발표가 끝난 대결이다.
     * 스케줄러의 재발송 방지 이력을 겸한다({@code V59__challenge_settlement.sql} 참고).
     */
    @Column(name = "settled_at")
    private LocalDateTime settledAt;

    /** 승자 — {@link #settledAt} 이 채워진 뒤의 {@code null} 은 무승부를 뜻한다. */
    @Column(name = "winner_user_id")
    private Long winnerUserId;

    /**
     * 결과 확정 — 기간이 끝난 뒤 한 번만. 이미 확정된 대결은 그대로 둔다
     * (소급 입력으로 결과가 뒤집혀 이미 발표한 승패와 어긋나는 것을 막는다).
     *
     * @param winnerUserId 무승부면 {@code null}
     * @return 이번 호출로 확정됐으면 true — 결과 푸시를 보낼지 판단하는 데 쓴다
     */
    public boolean settle(Long winnerUserId, LocalDateTime at) {
        if (settledAt != null) return false;
        this.winnerUserId = winnerUserId;
        this.settledAt = at;
        return true;
    }

    public boolean isSettled() {
        return settledAt != null;
    }

    @Builder
    private CoupleChallenge(Long coupleId, ChallengeType type, String title, LocalDate startDate,
                            LocalDate endDate, String stake, Long createdBy) {
        this.coupleId = coupleId;
        this.type = type;
        this.title = title;
        this.startDate = startDate;
        this.endDate = endDate;
        this.stake = stake;
        this.createdBy = createdBy;
    }
}
