package com.fitto.game.domain;

import com.fitto.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorColumn;
import jakarta.persistence.DiscriminatorType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Inheritance;
import jakarta.persistence.InheritanceType;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 커플 게임 한 판(공통) — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-2·5절.
 *
 * <p>스도쿠·오목이 {@code couple_games} 한 테이블을 쓰고 {@code game_type} 이 구분자다
 * (단일 테이블 상속). 종목별 컬럼은 서브클래스({@link SudokuGame}, {@link OmokGame})에 있고,
 * 관계 단위 삭제(Purger)는 테이블이 하나라 한 줄이다.
 *
 * <p>둘이 동시에 쓰면 문자열 전체를 덮어써 한쪽이 사라지므로, 입력 경로는 반드시
 * 리포지토리의 {@code findByIdForUpdate} 로 행을 잠근 뒤 상태를 바꾼다.
 */
@Entity
@Table(name = "couple_games")
@Inheritance(strategy = InheritanceType.SINGLE_TABLE)
@DiscriminatorColumn(name = "game_type", discriminatorType = DiscriminatorType.STRING, length = 20)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public abstract class CoupleGame extends BaseTimeEntity {

    /** 값 — 없음/given */
    public static final char OWNER_NONE = '0';
    /** 값 — 판을 연 사람(created_by) */
    public static final char OWNER_CREATOR = '1';
    /** 값 — 상대 */
    public static final char OWNER_PARTNER = '2';

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private GameStatus status;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    protected CoupleGame(Long coupleId, Long createdBy) {
        this.coupleId = coupleId;
        this.createdBy = createdBy;
        this.status = GameStatus.IN_PROGRESS;
    }

    public abstract GameType getGameType();

    public boolean isInProgress() {
        return status == GameStatus.IN_PROGRESS;
    }

    public boolean isCreator(Long userId) {
        return createdBy.equals(userId);
    }

    /** 이 사용자가 이 판에서 갖는 값 — {@link #OWNER_CREATOR} 또는 {@link #OWNER_PARTNER} */
    public char sideOf(Long userId) {
        return isCreator(userId) ? OWNER_CREATOR : OWNER_PARTNER;
    }

    protected void complete() {
        this.status = GameStatus.COMPLETED;
        this.completedAt = LocalDateTime.now();
    }

    public void abandon() {
        this.status = GameStatus.ABANDONED;
    }
}
