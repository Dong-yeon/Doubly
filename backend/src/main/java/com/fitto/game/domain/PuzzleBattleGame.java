package com.fitto.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 연쇄 퍼즐 대전 한 판 — docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md.
 *
 * <p><b>서버는 심판이 아니다.</b> 각자 자기 판에서 끝까지 두고(라이브면 동시에, 아니면
 * 상대의 기보를 고스트로 상대하며) 결과 한 벌을 보낸다. 둘 다 보내면 승자가 정해지고
 * 판이 끝난다. 수(手)는 저장하지 않는다 — 라이브 중계는 소켓으로만 흐른다.
 *
 * <p>a = 판을 연 사람({@code OWNER_CREATOR}), b = 상대. 컬럼 이름의 접미사가 그것이다.
 */
@Entity
@DiscriminatorValue("PUZZLE_BATTLE")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PuzzleBattleGame extends CoupleGame {

    public static final String WINNER_DRAW = "DRAW";
    /** 핸디캡 없음 — 받는 방해 100% */
    public static final int HANDICAP_NONE = 100;

    /** 조각 순서의 시드 — 같은 시드면 둘이 같은 조각을 받는다 */
    private Integer seed;

    @Column(name = "score_a")
    private Integer scoreA;
    @Column(name = "score_b")
    private Integer scoreB;
    @Column(name = "max_chain_a")
    private Integer maxChainA;
    @Column(name = "max_chain_b")
    private Integer maxChainB;
    /** 버틴 시간(ms). null 이면 아직 결과를 안 보낸 것이다 */
    @Column(name = "survived_ms_a")
    private Integer survivedMsA;
    @Column(name = "survived_ms_b")
    private Integer survivedMsB;
    @Column(name = "lost_a")
    private Boolean lostA;
    @Column(name = "lost_b")
    private Boolean lostB;
    /** 기보 — 형식은 {@code com.fitto.game.puzzle.Timeline} */
    @Column(name = "timeline_a", columnDefinition = "TEXT")
    private String timelineA;
    @Column(name = "timeline_b", columnDefinition = "TEXT")
    private String timelineB;
    /** 그 쪽이 받는 방해에 곱하는 백분율(§2-7). 판을 열 때 정해 양쪽이 같은 값을 본다 */
    @Column(name = "handicap_a")
    private Integer handicapA;
    @Column(name = "handicap_b")
    private Integer handicapB;
    /** '1'/'2'/DRAW — 끝난 판에만 값이 있다 */
    @Column(name = "battle_winner", length = 4)
    private String winner;

    @Builder
    private PuzzleBattleGame(Long coupleId, Long createdBy, int seed, int handicapA, int handicapB) {
        super(coupleId, createdBy);
        this.seed = seed;
        this.handicapA = handicapA;
        this.handicapB = handicapB;
    }

    @Override
    public GameType getGameType() {
        return GameType.PUZZLE_BATTLE;
    }

    /** 한 쪽의 결과 — 제출 전이면 null */
    public record Run(int score, int maxChain, int survivedMs, boolean lost, String timeline) {
    }

    public Run runOf(char side) {
        if (side == OWNER_CREATOR) {
            if (survivedMsA == null) return null;
            return new Run(nz(scoreA), nz(maxChainA), survivedMsA, Boolean.TRUE.equals(lostA), timelineA);
        }
        if (survivedMsB == null) return null;
        return new Run(nz(scoreB), nz(maxChainB), survivedMsB, Boolean.TRUE.equals(lostB), timelineB);
    }

    public boolean hasSubmitted(char side) {
        return runOf(side) != null;
    }

    public boolean bothSubmitted() {
        return hasSubmitted(OWNER_CREATOR) && hasSubmitted(OWNER_PARTNER);
    }

    public int handicapOf(char side) {
        Integer h = side == OWNER_CREATOR ? handicapA : handicapB;
        return h == null ? HANDICAP_NONE : h;
    }

    /** 이 쪽이 이겼는가 — 끝난 판에서만 의미 있다 */
    public boolean isWinner(char side) {
        return winner != null && winner.length() == 1 && winner.charAt(0) == side;
    }

    public boolean isDraw() {
        return WINNER_DRAW.equals(winner);
    }

    /**
     * 결과 제출. 둘 다 냈으면 승자를 정하고 판을 끝낸다.
     *
     * <p>승부 규칙 — <b>살아남은 쪽 &gt; 오래 버틴 쪽 &gt; 점수</b>. 라이브에서 상대가 먼저 죽으면
     * 나는 죽지 않은 채 결과를 내므로 첫 조건으로 끝난다. 고스트에서 상대의 기록보다 오래
     * 버티면 앱이 그 시점에 "살아남음"으로 낸다. 둘 다 죽었으면(§4-2 5번 동시 종료 포함)
     * 버틴 시간이 곧 시퀀스다.
     *
     * @return 이 제출로 판이 끝났으면 true
     */
    public boolean submit(char side, Run run) {
        if (side == OWNER_CREATOR) {
            scoreA = run.score();
            maxChainA = run.maxChain();
            survivedMsA = run.survivedMs();
            lostA = run.lost();
            timelineA = run.timeline();
        } else {
            scoreB = run.score();
            maxChainB = run.maxChain();
            survivedMsB = run.survivedMs();
            lostB = run.lost();
            timelineB = run.timeline();
        }
        if (!bothSubmitted()) return false;

        Run a = runOf(OWNER_CREATOR);
        Run b = runOf(OWNER_PARTNER);
        this.winner = decide(a, b);
        complete();
        return true;
    }

    private static String decide(Run a, Run b) {
        if (a.lost() != b.lost()) return a.lost() ? String.valueOf(OWNER_PARTNER) : String.valueOf(OWNER_CREATOR);
        if (a.survivedMs() != b.survivedMs()) {
            return a.survivedMs() > b.survivedMs() ? String.valueOf(OWNER_CREATOR) : String.valueOf(OWNER_PARTNER);
        }
        if (a.score() != b.score()) {
            return a.score() > b.score() ? String.valueOf(OWNER_CREATOR) : String.valueOf(OWNER_PARTNER);
        }
        return WINNER_DRAW;
    }

    private static int nz(Integer v) {
        return v == null ? 0 : v;
    }
}
