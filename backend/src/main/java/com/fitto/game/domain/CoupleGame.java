package com.fitto.game.domain;

import com.fitto.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

import java.time.LocalDateTime;

/**
 * 커플 게임 한 판 — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-2절.
 *
 * <p>판 전체를 81자 문자열 넷(puzzle·solution·board·ownerMap)으로 든다. 둘이 동시에 다른 칸을
 * 쓰면 문자열 전체를 덮어써 한쪽이 사라지므로, 입력 경로는 반드시
 * {@code CoupleGameRepository.findByIdForUpdate} 로 행을 잠근 뒤 {@link #fill} 을 부른다.
 */
@Entity
@Table(name = "couple_games")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoupleGame extends BaseTimeEntity {

    public static final int CELLS = 81;
    /** owner_map 값 — 없음/given */
    public static final char OWNER_NONE = '0';
    /** owner_map 값 — 판을 연 사람(created_by) */
    public static final char OWNER_CREATOR = '1';
    /** owner_map 값 — 상대 */
    public static final char OWNER_PARTNER = '2';

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Enumerated(EnumType.STRING)
    @Column(name = "game_type", nullable = false, length = 20)
    private GameType gameType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private GameDifficulty difficulty;

    /** 주어진 숫자. 빈칸 '0' */
    @Column(nullable = false, length = CELLS)
    private String puzzle;

    /** 정답 — 응답 DTO 에 절대 싣지 않는다 */
    @Column(nullable = false, length = CELLS)
    private String solution;

    /** 현재 상태(given 포함) */
    @Column(nullable = false, length = CELLS)
    private String board;

    /** 칸마다 누가 채웠는지 — {@link #OWNER_NONE}/{@link #OWNER_CREATOR}/{@link #OWNER_PARTNER} */
    @Column(name = "owner_map", nullable = false, length = CELLS)
    private String ownerMap;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private GameStatus status;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Builder
    private CoupleGame(Long coupleId, GameType gameType, GameDifficulty difficulty,
                       String puzzle, String solution, Long createdBy) {
        this.coupleId = coupleId;
        this.gameType = gameType;
        this.difficulty = difficulty;
        this.puzzle = puzzle;
        this.solution = solution;
        this.board = puzzle;
        this.ownerMap = String.valueOf(OWNER_NONE).repeat(CELLS);
        this.status = GameStatus.IN_PROGRESS;
        this.createdBy = createdBy;
    }

    public boolean isGiven(int index) {
        return puzzle.charAt(index) != '0';
    }

    public boolean isInProgress() {
        return status == GameStatus.IN_PROGRESS;
    }

    /**
     * 칸 하나를 채우거나(1~9) 비운다(0). 누구든 어떤 칸이든 덮어쓸 수 있다 — 상대가 틀린 걸
     * 내가 고칠 수 있어야 협동이다. 정답 여부는 검사하지 않고 그대로 들어간다(설계 3-1절).
     *
     * @return 이 입력으로 판이 완성됐으면 true
     */
    public boolean fill(int index, int value, boolean byCreator) {
        char[] b = board.toCharArray();
        char[] o = ownerMap.toCharArray();
        b[index] = (char) ('0' + value);
        o[index] = value == 0 ? OWNER_NONE : (byCreator ? OWNER_CREATOR : OWNER_PARTNER);
        this.board = new String(b);
        this.ownerMap = new String(o);
        if (board.equals(solution)) {
            this.status = GameStatus.COMPLETED;
            this.completedAt = LocalDateTime.now();
            return true;
        }
        return false;
    }

    public void abandon() {
        this.status = GameStatus.ABANDONED;
    }

    public int countOwned(char owner) {
        int n = 0;
        for (int i = 0; i < CELLS; i++) {
            if (ownerMap.charAt(i) == owner) n++;
        }
        return n;
    }
}
