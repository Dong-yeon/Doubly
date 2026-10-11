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

    /**
     * 재촉·리마인더 시각(V108) — 판이 움직인 게 아니라서 엔티티로 고치지 않는다(그러면 updated_at 이 바뀐다).
     * 쓰기는 {@code CoupleGameRepository} 의 벌크 update 로만 한다.
     */
    @Column(name = "nudged_by_creator_at")
    private LocalDateTime nudgedByCreatorAt;

    @Column(name = "nudged_by_partner_at")
    private LocalDateTime nudgedByPartnerAt;

    @Column(name = "reminded_at")
    private LocalDateTime remindedAt;

    protected CoupleGame(Long coupleId, Long createdBy) {
        this.coupleId = coupleId;
        this.createdBy = createdBy;
        this.status = GameStatus.IN_PROGRESS;
    }

    public abstract GameType getGameType();

    /**
     * 지금 이 판이 <b>누구를 기다리는가</b> — 재촉·리마인더가 누구에게 갈지 정한다(docs/GAME_NUDGE_2026-09-30.md).
     *
     * @return {@link #OWNER_CREATOR}·{@link #OWNER_PARTNER}, 또는 차례가 없으면(같이 푸는 스도쿠, 아직 아무도
     *         안 둔 대전) {@link #OWNER_NONE} — 그때는 누구든 상대를 부를 수 있다
     */
    public abstract char awaitedSide();

    /** 이 쪽이 마지막으로 찌른 시각 — 없으면 null */
    public LocalDateTime nudgedAtBy(char side) {
        return side == OWNER_CREATOR ? nudgedByCreatorAt : nudgedByPartnerAt;
    }

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
