package com.fitto.relation.domain;

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
 * 관계 — 설계서 5.3 relations. 커플(COUPLE) / 트레이너-회원(TRAINER_MEMBER) 공통 구조.
 * relations 테이블에는 created_at 만 존재하므로 BaseTimeEntity 를 상속하지 않는다.
 */
@Entity
@Table(name = "relations")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Relation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "relation_type", nullable = false, length = 30)
    private RelationType relationType;

    /** 요청자 (커플 먼저 초대 / 트레이너) */
    @Column(name = "user_a_id", nullable = false)
    private Long userAId;

    /** 수락자 (커플 / 회원) — 연결 전 NULL */
    @Column(name = "user_b_id")
    private Long userBId;

    @Column(name = "invite_code", length = 10, unique = true)
    private String inviteCode;

    @Column(name = "code_expires_at")
    private LocalDateTime codeExpiresAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RelationStatus status;

    @Column(name = "connected_at")
    private LocalDateTime connectedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    /** 커플 공유 배경 이미지 URL (홈 메인) */
    @Column(name = "background_image_url", length = 500)
    private String backgroundImageUrl;

    /** 커플 기념일 (D-day 기준일) */
    @Column(name = "anniversary_date")
    private LocalDate anniversaryDate;

    /** 커플 공동 식단 목표 — 이번 주 둘 다 기록할 일수 (1~7, NULL = 미설정) */
    @Column(name = "diet_goal_days")
    private Integer dietGoalDays;

    /**
     * 지난 기록 불러오기를 먼저 요청한 사람 (REL-07).
     * 상대가 요청하면 그 시점에 복원이 실행된다. NULL = 아직 아무도 요청하지 않음.
     */
    @Column(name = "restore_requested_by")
    private Long restoreRequestedBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private Relation(RelationType relationType, Long userAId, Long userBId,
                     String inviteCode, LocalDateTime codeExpiresAt, RelationStatus status) {
        this.relationType = relationType;
        this.userAId = userAId;
        this.userBId = userBId;
        this.inviteCode = inviteCode;
        this.codeExpiresAt = codeExpiresAt;
        this.status = status != null ? status : RelationStatus.PENDING;
    }

    /** 초대코드로 상대방이 연결. 코드는 비우고 ACTIVE 로 전환. */
    public void connect(Long userBId) {
        this.userBId = userBId;
        this.status = RelationStatus.ACTIVE;
        this.connectedAt = LocalDateTime.now();
        this.inviteCode = null;
        this.codeExpiresAt = null;
    }

    public void end() {
        this.status = RelationStatus.ENDED;
        this.endedAt = LocalDateTime.now();
    }

    public void updateBackground(String url) {
        this.backgroundImageUrl = url;
    }

    public void updateAnniversary(LocalDate date) {
        this.anniversaryDate = date;
    }

    public void updateDietGoal(Integer days) {
        this.dietGoalDays = days;
    }

    /*
     * 불러오기 요청 기록은 도메인 메서드가 아니라 RelationRepository.claimRestoreRequest
     * (조건부 UPDATE) 로만 쓴다 — 읽고-쓰는 방식은 동시 요청에서 서로를 덮어쓴다.
     */

    /**
     * 상대가 이미 요청해둔 상태인지 — 이 사용자가 요청하면 복원이 성립한다.
     * 같은 사람이 두 번 눌러도 성립하지 않아야 하므로 요청자가 <b>다른</b> 사람인지 본다.
     */
    public boolean isRestoreAgreedBy(Long userId) {
        return this.restoreRequestedBy != null && !this.restoreRequestedBy.equals(userId);
    }

    public boolean isExpired() {
        return codeExpiresAt != null && codeExpiresAt.isBefore(LocalDateTime.now());
    }

    public boolean involves(Long userId) {
        return userId.equals(userAId) || userId.equals(userBId);
    }

    /**
     * 현재 유효한 관계인지.
     *
     * <p>주의: {@link #involves(Long)} 만으로 접근을 허용하면 안 된다.
     * 관계를 종료해도 user_a_id / user_b_id 는 그대로 남기 때문에 involves 는 계속 true 다.
     * 즉 "연결을 끊었는데도 상대가 계속 접근 가능한" 상태가 된다.
     * 채팅처럼 종료 후 차단되어야 하는 기능은 반드시 이 검사를 함께 해야 한다.
     */
    public boolean isActive() {
        return this.status == RelationStatus.ACTIVE;
    }

    /** 주어진 사용자 기준 상대방 ID (없으면 null) */
    public Long partnerOf(Long userId) {
        if (userId.equals(userAId)) return userBId;
        if (userId.equals(userBId)) return userAId;
        return null;
    }
}
