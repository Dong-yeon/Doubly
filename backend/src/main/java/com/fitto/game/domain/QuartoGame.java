package com.fitto.game.domain;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.quarto.QuartoRules;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Arrays;
import java.util.List;

/**
 * 넷이 같아 한 판 — 4×4 판에 말 16개. docs/game-current-state.md 11절. 판정은 {@link QuartoRules}.
 *
 * <p>한 수 = "상대가 준 말을 놓기" + "남은 말 하나를 상대에게 주기"이고, 둘을 한 번에 받는다
 * ({@link #apply}). 0 번째 수만 예외로 말 주기뿐이다 — 아직 놓을 말이 없다.
 *
 * <p>선공은 길막기·오목과 같이 <b>상대</b>다. 0 번째 수(말 주기)를 상대가, 첫 놓기를 판을 연 사람이 한다.
 * 그래서 차례는 수 번호의 홀짝으로 정해지고 따로 저장하지 않는다.
 *
 * <p>"놓은 사람만 이긴다" — 공식 규칙의 "선언" 없이 놓는 순간 서버가 판정한다. 놓았는데 이기는 줄이
 * 생겼으면 그 사람이 이긴 것이고, 상대가 나중에 알아채는 단계는 없다.
 */
@Entity
@DiscriminatorValue("QUARTO")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuartoGame extends CoupleGame {

    /**
     * 사용자에게 보이는 이름 — 러뷰포(2026-10-13 사용자 결정, 예전 임시 이름 "넷이 같아(가칭)"). 상표 때문에 원작 이름은
     * 쓰지 않는다. 앱의 {@code constants/quarto.ts} 의 {@code QUARTO_DISPLAY_NAME} 과 같이 바꾼다.
     */
    public static final String DISPLAY_NAME = "러뷰포";

    /** 16자, 칸마다 '0'~'f' 또는 '.' */
    @Column(name = "quarto_board", length = 16)
    private String board;

    @Column(name = "quarto_pending")
    private Integer pendingPiece;

    @Column(name = "quarto_move_no")
    private Integer moveNo;

    /** '1'/'2' — 이긴 판에만 */
    @Column(name = "quarto_winner", length = 1)
    private String winnerSide;

    /** "0,5,10,15" — 이긴 판에만 */
    @Column(name = "quarto_win_line", length = 16)
    private String winLine;

    @Builder
    private QuartoGame(Long coupleId, Long createdBy) {
        super(coupleId, createdBy);
        this.board = QuartoRules.emptyBoard();
        this.moveNo = 0;
    }

    @Override
    public GameType getGameType() {
        return GameType.QUARTO;
    }

    @Override
    public char awaitedSide() {
        return isInProgress() ? turnSide() : OWNER_NONE;
    }

    /** 지금 둘 쪽 — 짝수 번째 수(0 포함)는 상대(선공), 홀수 번째는 판을 연 사람 */
    public char turnSide() {
        return moveNo % 2 == 0 ? OWNER_PARTNER : OWNER_CREATOR;
    }

    public boolean isTurnOf(Long userId) {
        return turnSide() == sideOf(userId);
    }

    /** 이번 수가 말 주기뿐인가 — 0 번째 수 */
    public boolean isGiveOnlyMove() {
        return moveNo == 0;
    }

    public int[] boardCells() {
        return QuartoRules.parse(board);
    }

    public List<Integer> remainingPieces() {
        return QuartoRules.remaining(boardCells(), pendingPiece);
    }

    public boolean isWinner(char side) {
        return winnerSide != null && winnerSide.charAt(0) == side;
    }

    public boolean isDraw() {
        return getStatus() == GameStatus.COMPLETED && winnerSide == null;
    }

    public int[] winLineCells() {
        if (winLine == null || winLine.isBlank()) return null;
        return Arrays.stream(winLine.split(",")).mapToInt(Integer::parseInt).toArray();
    }

    /**
     * 한 수를 적용한 결과 — 서비스가 수 기록에 그대로 남긴다.
     *
     * @param give 실제로 준 말. 15번째 놓기 뒤처럼 서버가 채운 경우도 여기 들어간다
     */
    public record Applied(Integer place, Integer give, boolean finished) {
    }

    /**
     * 한 수를 검사하고 적용한다 — <b>검사를 전부 마친 뒤에만</b> 상태를 바꾼다. 거절은 원인마다 다른 코드다.
     * 앱이 형식을 미리 맞춰 보내므로 이 거절은 대부분 앱 버그이고, 코드가 갈라져 있어야 어디가 틀렸는지 보인다.
     *
     * <p>형식: 첫 수 {@code {give}} / 보통 수 {@code {place, give}} / 이기는 수·16번째 수 {@code {place}}.
     * 15번째 놓기 뒤에는 남은 말이 하나뿐이라 서버가 {@code give} 를 채운다(보냈다면 그 말과 같아야 한다).
     *
     * @param piece 앱이 "이 말을 놓는다"고 믿는 말 — 보냈으면 받은 말과 대조한다(낡은 화면에서 둔 수를 걸러낸다)
     */
    public Applied apply(Integer place, Integer give, Integer piece, char side) {
        if (!isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (turnSide() != side) {
            throw new BusinessException(ErrorCode.GAME_NOT_YOUR_TURN);
        }
        if (isGiveOnlyMove()) {
            return applyFirstGive(place, give, piece);
        }

        if (place == null) {
            throw new BusinessException(ErrorCode.QUARTO_MOVE_SHAPE);
        }
        requireRange(place);
        if (give != null) requireRange(give);
        if (piece != null) requireRange(piece);

        int[] cells = boardCells();
        if (cells[place] != QuartoRules.EMPTY) {
            throw new BusinessException(ErrorCode.QUARTO_CELL_OCCUPIED);
        }
        if (piece != null && !piece.equals(pendingPiece)) {
            throw new BusinessException(ErrorCode.QUARTO_PIECE_MISMATCH);
        }

        cells[place] = pendingPiece;
        int[] line = QuartoRules.winningLineThrough(cells, place);
        if (line != null) {
            // 이기는 수에 말을 같이 보냈다 — 무시하면 앱이 "이긴 줄 모르고 둔" 버그가 묻힌다
            if (give != null) {
                throw new BusinessException(ErrorCode.QUARTO_GIVE_ON_WIN);
            }
            commit(cells, null);
            this.winnerSide = String.valueOf(side);
            this.winLine = joinLine(line);
            complete();
            return new Applied(place, null, true);
        }

        List<Integer> left = QuartoRules.remaining(cells, null);
        if (left.isEmpty()) {
            // 16번째 말을 놓았는데 이긴 줄이 없다 — 무승부. 줄 말이 없으므로 give 는 형식 위반이다
            if (give != null) {
                throw new BusinessException(ErrorCode.QUARTO_MOVE_SHAPE);
            }
            commit(cells, null);
            complete();
            return new Applied(place, null, true);
        }

        int next;
        if (left.size() == 1) {
            // 15번째 놓기 뒤 — 고를 것이 없으니 서버가 채운다. 보냈다면 그 말이어야 한다
            next = left.get(0);
            if (give != null && give != next) {
                throw new BusinessException(ErrorCode.QUARTO_PIECE_USED);
            }
        } else {
            if (give == null) {
                throw new BusinessException(ErrorCode.QUARTO_MOVE_SHAPE);
            }
            if (!left.contains(give)) {
                throw new BusinessException(ErrorCode.QUARTO_PIECE_USED);
            }
            next = give;
        }
        commit(cells, next);
        return new Applied(place, next, false);
    }

    private Applied applyFirstGive(Integer place, Integer give, Integer piece) {
        // 첫 수에는 놓을 말이 없다 — place·piece 가 오면 앱이 순서를 잘못 안 것이다
        if (place != null || piece != null || give == null) {
            throw new BusinessException(ErrorCode.QUARTO_MOVE_SHAPE);
        }
        requireRange(give);
        commit(boardCells(), give);
        return new Applied(null, give, false);
    }

    private void commit(int[] cells, Integer nextPending) {
        this.board = QuartoRules.format(cells);
        this.pendingPiece = nextPending;
        this.moveNo = moveNo + 1;
    }

    private static void requireRange(int v) {
        if (!QuartoRules.inRange(v)) {
            throw new BusinessException(ErrorCode.QUARTO_OUT_OF_RANGE);
        }
    }

    private static String joinLine(int[] line) {
        return line[0] + "," + line[1] + "," + line[2] + "," + line[3];
    }

    public static char opponentOf(char side) {
        return side == OWNER_CREATOR ? OWNER_PARTNER : OWNER_CREATOR;
    }
}
