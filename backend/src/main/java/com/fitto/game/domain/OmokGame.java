package com.fitto.game.domain;

import com.fitto.game.omok.OmokRules;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 오목 한 판 — 15×15, 다섯 개 이상 연속이면 승리. 렌주 제한(삼삼·사사·장목)은 두지 않는다.
 * docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절.
 *
 * <p>판을 연 사람이 <b>백(후공)</b>이다 — 흑(선공)이 유리하므로 도전받은 쪽에 선공을 준다.
 */
@Entity
@DiscriminatorValue("OMOK")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OmokGame extends CoupleGame {

    public static final int SIZE = OmokRules.SIZE;
    public static final int CELLS = OmokRules.CELLS;
    public static final String WINNER_DRAW = "DRAW";

    /** 225자. '0' 빈칸, '1' 판을 연 사람(백), '2' 상대(흑) */
    @Column(length = 256)
    private String stones;

    /** 다음에 둘 사람 — '1'/'2' */
    @Column(name = "next_turn", length = 1)
    private String nextTurn;

    /** '1'/'2'/DRAW — 끝난 판에만 값이 있다 */
    @Column(length = 4)
    private String winner;

    /** 이긴 다섯 칸 인덱스, 쉼표 구분 */
    @Column(name = "winning_line", length = 64)
    private String winningLine;

    @Column(name = "last_move")
    private Integer lastMove;

    @Column(name = "last_moved_at")
    private LocalDateTime lastMovedAt;

    /**
     * 착수 인덱스를 순서대로 쉼표로 이은 것 — 무르기·복기가 전부 여기서 나온다.
     * V91 이전에 시작된 판은 비어 있다({@link #lastMove} 만 있다).
     */
    @Column(length = 1024)
    private String moves;

    /** 무르기를 요청한 쪽 '1'/'2' — 대기 중일 때만 값이 있다 */
    @Column(name = "undo_requested_by", length = 1)
    private String undoRequestedBy;

    @Builder
    private OmokGame(Long coupleId, Long createdBy) {
        super(coupleId, createdBy);
        this.stones = String.valueOf(OWNER_NONE).repeat(CELLS);
        // 흑(선공) = 상대. 판을 연 사람은 백(후공).
        this.nextTurn = String.valueOf(OWNER_PARTNER);
        this.moves = "";
    }

    @Override
    public GameType getGameType() {
        return GameType.OMOK;
    }

    public char nextTurnSide() {
        return nextTurn.charAt(0);
    }

    public boolean isTurnOf(Long userId) {
        return nextTurnSide() == sideOf(userId);
    }

    public boolean isEmpty(int index) {
        return stones.charAt(index) == OWNER_NONE;
    }

    public int moveCount() {
        int n = 0;
        for (int i = 0; i < CELLS; i++) {
            if (stones.charAt(i) != OWNER_NONE) n++;
        }
        return n;
    }

    public List<Integer> winningLineIndexes() {
        if (winningLine == null || winningLine.isBlank()) return List.of();
        return Arrays.stream(winningLine.split(",")).map(Integer::parseInt).toList();
    }

    /** 둔 순서대로의 착수 인덱스 — 복기가 이걸 그대로 재생한다 */
    public List<Integer> moveIndexes() {
        if (moves == null || moves.isBlank()) return List.of();
        return Arrays.stream(moves.split(",")).map(Integer::parseInt).toList();
    }

    public char undoRequestedSide() {
        return undoRequestedBy == null ? OWNER_NONE : undoRequestedBy.charAt(0);
    }

    public boolean hasUndoRequest() {
        return undoRequestedBy != null;
    }

    /**
     * 무를 수 있는 수가 있는가 — {@link #moves} 가 빈 V91 이전 판도 마지막 수 하나는 무를 수 있다.
     * (배포 시점에 진행 중이던 판에서 버튼만 죽어 보이지 않도록.)
     */
    public boolean hasUndoableMove() {
        return !moveIndexes().isEmpty() || lastMove != null;
    }

    /**
     * 무르기 요청 — <b>직전에 둔 사람</b>만 걸 수 있다. 즉 지금 자기 차례가 아닌 쪽이다.
     * 이긴 수는 판이 이미 끝나므로(COMPLETED) 여기 오지 않는다.
     */
    public boolean canRequestUndo(Long userId) {
        return isInProgress() && !hasUndoRequest() && hasUndoableMove() && !isTurnOf(userId);
    }

    public void requestUndo(char side) {
        this.undoRequestedBy = String.valueOf(side);
    }

    public void clearUndoRequest() {
        this.undoRequestedBy = null;
    }

    /**
     * 마지막 수 한 개를 되돌린다 — 돌을 거두고 차례를 무른 사람에게 돌려준다.
     *
     * <p>한 수(1 ply)만 무른다. "내 수와 상대의 대응까지" 같은 다단 무르기는 어디까지 되돌렸는지
     * 서로 헷갈리기 시작하는 지점이라 넣지 않는다 — 필요하면 한 번 더 요청하면 된다.
     */
    public void undoLastMove() {
        List<Integer> list = new ArrayList<>(moveIndexes());
        Integer target;
        if (!list.isEmpty()) {
            target = list.remove(list.size() - 1);
        } else {
            target = lastMove; // V91 이전 판 — 이력은 없어도 마지막 수는 안다
            if (target == null) return;
        }

        char[] s = stones.toCharArray();
        char side = s[target];
        s[target] = OWNER_NONE;
        this.stones = new String(s);
        this.moves = list.stream().map(String::valueOf).collect(Collectors.joining(","));
        this.lastMove = list.isEmpty() ? null : list.get(list.size() - 1);
        this.lastMovedAt = LocalDateTime.now();
        // 무른 사람이 다시 둔다
        if (side != OWNER_NONE) this.nextTurn = String.valueOf(side);
        this.undoRequestedBy = null;
    }

    /**
     * 돌 하나를 놓는다. 차례·빈칸 검사는 서비스가 먼저 한다.
     *
     * @return 이 수로 끝났으면(승리 또는 무승부) true
     */
    public boolean place(int index, char side) {
        char[] s = stones.toCharArray();
        s[index] = side;
        this.stones = new String(s);
        this.lastMove = index;
        this.lastMovedAt = LocalDateTime.now();
        this.moves = (moves == null || moves.isBlank()) ? String.valueOf(index) : moves + "," + index;
        // 상대가 무르기를 걸어둔 채로 내가 그냥 두면, 그건 "됐고 계속 두자"는 뜻이다
        this.undoRequestedBy = null;

        List<Integer> line = OmokRules.winningLine(stones, index);
        if (!line.isEmpty()) {
            this.winner = String.valueOf(side);
            this.winningLine = line.stream().map(String::valueOf).collect(Collectors.joining(","));
            complete();
            return true;
        }
        if (moveCount() >= CELLS) {
            this.winner = WINNER_DRAW;
            complete();
            return true;
        }
        this.nextTurn = String.valueOf(side == OWNER_CREATOR ? OWNER_PARTNER : OWNER_CREATOR);
        return false;
    }
}
