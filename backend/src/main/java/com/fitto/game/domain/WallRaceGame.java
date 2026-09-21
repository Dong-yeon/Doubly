package com.fitto.game.domain;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.wallrace.WallRaceRules;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 길막기 한 판 — 9×9 판에서 말을 반대편 끝줄까지 먼저 보내면 이긴다.
 * docs/PATH_LOCK_ANALYSIS_2026-09-21.md. 규칙 계산은 전부 {@link WallRaceRules} 에 있다.
 *
 * <p>판을 연 사람(A)은 <b>맨 윗줄 가운데</b>에서 시작해 맨 아랫줄로 가고, 상대(B)는 그 반대다.
 * 오목과 같이 <b>선공은 상대</b>다 — 도전받은 쪽에 먼저 두는 이득을 준다.
 *
 * <p>무승부가 없다. 벽은 길을 <b>돌게</b>만 할 수 있고 <b>막을</b> 수는 없어서
 * ({@link WallRaceRules#wallKeepsBothPaths}) 양쪽 모두 언제나 목표 줄에 닿을 수 있다.
 */
@Entity
@DiscriminatorValue("WALL_RACE")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WallRaceGame extends CoupleGame {

    public static final int SIZE = WallRaceRules.SIZE;
    public static final int CELLS = WallRaceRules.CELLS;
    public static final int WALL_SLOTS = WallRaceRules.WALL_SLOTS;

    /** 기본 벽 개수 — 표준 쿼리도와 같은 10개. 둘이 합쳐 20개면 판이 충분히 복잡해진다 */
    public static final int WALLS_DEFAULT = 10;
    /** 핸디캡 최대치 — 이보다 더 주면 받는 쪽이 이겨도 이긴 것 같지 않다 */
    public static final int WALLS_HANDICAP_MAX = WALLS_DEFAULT + 4;

    /** A(판을 연 사람)가 닿아야 하는 줄 — 맨 아랫줄 */
    public static final int GOAL_ROW_CREATOR = SIZE - 1;
    /** B(상대)가 닿아야 하는 줄 — 맨 윗줄 */
    public static final int GOAL_ROW_PARTNER = 0;

    @Column(name = "pawn_a")
    private Integer pawnA;

    @Column(name = "pawn_b")
    private Integer pawnB;

    /** 64자, '0'/'H'/'V' */
    @Column(length = 64)
    private String walls;

    @Column(name = "walls_left_a")
    private Integer wallsLeftA;

    @Column(name = "walls_left_b")
    private Integer wallsLeftB;

    @Column(name = "walls_start_a")
    private Integer wallsStartA;

    @Column(name = "walls_start_b")
    private Integer wallsStartB;

    /** 다음에 둘 사람 '1'/'2' */
    @Column(name = "race_turn", length = 1)
    private String raceTurn;

    /** '1'/'2' — 끝난 판에만 값이 있다 */
    @Column(name = "race_winner", length = 4)
    private String raceWinner;

    /** {@code race_moves} 칼럼 길이 — 넘기면 기록만 멈추고 판은 계속 간다 */
    private static final int MOVES_MAX = 1024;

    /** 'P<칸>' / 'W<교차점><H|V>' 를 쉼표로 이은 기보 */
    @Column(name = "race_moves", length = 1024)
    private String raceMoves;

    @Builder
    private WallRaceGame(Long coupleId, Long createdBy, int wallsStartA, int wallsStartB) {
        super(coupleId, createdBy);
        this.pawnA = WallRaceRules.startCell(GOAL_ROW_CREATOR);
        this.pawnB = WallRaceRules.startCell(GOAL_ROW_PARTNER);
        this.walls = WallRaceRules.emptyWalls();
        this.wallsStartA = wallsStartA;
        this.wallsStartB = wallsStartB;
        this.wallsLeftA = wallsStartA;
        this.wallsLeftB = wallsStartB;
        // 선공 = 상대. 판을 연 사람이 후공.
        this.raceTurn = String.valueOf(OWNER_PARTNER);
        this.raceMoves = "";
    }

    @Override
    public GameType getGameType() {
        return GameType.WALL_RACE;
    }

    public char turnSide() {
        return raceTurn.charAt(0);
    }

    public boolean isTurnOf(Long userId) {
        return turnSide() == sideOf(userId);
    }

    public int pawnOf(char side) {
        return side == OWNER_CREATOR ? pawnA : pawnB;
    }

    public int goalRowOf(char side) {
        return side == OWNER_CREATOR ? GOAL_ROW_CREATOR : GOAL_ROW_PARTNER;
    }

    public int wallsLeftOf(char side) {
        return side == OWNER_CREATOR ? wallsLeftA : wallsLeftB;
    }

    public int wallsStartOf(char side) {
        return side == OWNER_CREATOR ? wallsStartA : wallsStartB;
    }

    public static char opponentOf(char side) {
        return side == OWNER_CREATOR ? OWNER_PARTNER : OWNER_CREATOR;
    }

    /** 이 쪽이 지금 둘 수 있는 말 자리 — 상대 말을 뛰어넘는 경우까지 포함한다 */
    public List<Integer> legalMovesOf(char side) {
        return WallRaceRules.legalMoves(walls, pawnOf(side), pawnOf(opponentOf(side)));
    }

    public boolean isWinner(char side) {
        return raceWinner != null && raceWinner.charAt(0) == side;
    }

    /** 기보 — 'P12' / 'W35H' 순서대로. 복기가 이걸 그대로 재생한다 */
    public List<String> moveList() {
        if (raceMoves == null || raceMoves.isBlank()) return List.of();
        return Arrays.asList(raceMoves.split(","));
    }

    public int moveCount() {
        return moveList().size();
    }

    /**
     * 말을 옮긴다. 차례 검사는 서비스가 먼저 하고, <b>둘 수 있는 자리인지는 여기서</b> 본다 —
     * 점프·대각선까지 걸린 목록과 비교하는 것이 이 규칙의 유일한 정답이다.
     *
     * @return 이 수로 목표 줄에 닿았으면 true
     */
    public boolean movePawn(int target, char side) {
        if (!legalMovesOf(side).contains(target)) {
            throw new BusinessException(ErrorCode.GAME_MOVE_ILLEGAL);
        }
        if (side == OWNER_CREATOR) {
            this.pawnA = target;
        } else {
            this.pawnB = target;
        }
        record("P" + target);

        if (WallRaceRules.row(target) == goalRowOf(side)) {
            this.raceWinner = String.valueOf(side);
            complete();
            return true;
        }
        passTurn(side);
        return false;
    }

    /**
     * 벽 하나를 놓는다 — 이 게임에서 <b>틀리기 쉬운 자리가 전부 여기</b>다.
     * 남은 벽, 겹침, 그리고 두 말의 길이 살아 있는지를 순서대로 본다. 마지막 검사가 없으면
     * 상대를 가둬 버릴 수 있고, 그러면 게임이 아니라 잠금장치가 된다.
     */
    public void placeWall(int slot, char kind, char side) {
        if (wallsLeftOf(side) <= 0) {
            throw new BusinessException(ErrorCode.GAME_WALLS_EXHAUSTED);
        }
        if (!WallRaceRules.canPlaceWall(walls, slot, kind)) {
            throw new BusinessException(ErrorCode.GAME_WALL_OVERLAP);
        }
        if (!WallRaceRules.wallKeepsBothPaths(walls, slot, kind,
                pawnA, GOAL_ROW_CREATOR, pawnB, GOAL_ROW_PARTNER)) {
            throw new BusinessException(ErrorCode.GAME_WALL_BLOCKS_PATH);
        }

        this.walls = WallRaceRules.place(walls, slot, kind);
        if (side == OWNER_CREATOR) {
            this.wallsLeftA = wallsLeftA - 1;
        } else {
            this.wallsLeftB = wallsLeftB - 1;
        }
        record("W" + slot + kind);
        passTurn(side);
    }

    private void passTurn(char side) {
        this.raceTurn = String.valueOf(opponentOf(side));
    }

    /** 기보 칸이 꽉 차는 지경이 오면 <b>기록을 멈춘다</b> — 복기 한 줄 때문에 수가 거절되면 안 된다 */
    private void record(String move) {
        List<String> list = new ArrayList<>(moveList());
        list.add(move);
        String next = String.join(",", list);
        if (next.length() > MOVES_MAX) return;
        this.raceMoves = next;
    }
}
