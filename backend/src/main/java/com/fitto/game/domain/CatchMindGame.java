package com.fitto.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 캐치마인드 한 판 — 한 명이 그리고 한 명이 맞힌다. docs/CATCH_MIND_2026-09-14.md.
 *
 * <p><b>비동기다.</b> 그리는 동안은 서버에 아무것도 없고(그리기는 앱 안에서만 일어난다),
 * 다 그린 그림이 한 번에 올라오면서 판이 생긴다. 그래서 "그리는 중" 상태가 없고, 판은
 * 만들어지는 순간부터 {@link GameStatus#IN_PROGRESS}(= 상대가 맞히는 중)다.
 *
 * <p>그린 사람은 {@code createdBy} 다 — 이 테이블의 {@code OWNER_CREATOR} 규약 그대로다.
 */
@Entity
@DiscriminatorValue("CATCH_MIND")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CatchMindGame extends CoupleGame {

    /** 틀린 시도는 최근 것부터 이만큼만 남긴다 — 컬럼이 VARCHAR(500) 이라 무한히 쌓을 수 없다 */
    public static final int MAX_WRONG_GUESSES_KEPT = 10;
    private static final String WRONG_GUESS_SEPARATOR = "\n";

    /** 제시어 — 맞히는 사람에게는 절대 내려가지 않는다(스도쿠 solution 과 같은 취급) */
    @Column(length = 40)
    private String word;

    /** 그림 — "색,굵기,x1,y1,x2,y2;..." 형식. 서버는 해석하지 않고 형식만 검증한다 */
    @Column(columnDefinition = "TEXT")
    private String strokes;

    /** 틀린 시도, 줄바꿈 구분. 그린 사람이 나중에 보는 재미가 이 게임의 절반이다 */
    @Column(name = "wrong_guesses", length = 500)
    private String wrongGuesses;

    @Column(name = "guess_count")
    private Integer guessCount;

    /** 초성 힌트를 열었는가 — 열어도 실패로 치지 않는다 */
    @Column(name = "hint_used")
    private Boolean hintUsed;

    @Builder
    private CatchMindGame(Long coupleId, Long createdBy, String word, String strokes) {
        super(coupleId, createdBy);
        this.word = word;
        this.strokes = strokes;
        this.wrongGuesses = "";
        this.guessCount = 0;
        this.hintUsed = false;
    }

    @Override
    public GameType getGameType() {
        return GameType.CATCH_MIND;
    }

    /** 그린 사람인가 — 아니면 맞히는 사람이다 */
    public boolean isDrawer(Long userId) {
        return isCreator(userId);
    }

    public int guessCount() {
        return guessCount == null ? 0 : guessCount;
    }

    public boolean isHintUsed() {
        return Boolean.TRUE.equals(hintUsed);
    }

    public List<String> wrongGuessList() {
        if (wrongGuesses == null || wrongGuesses.isBlank()) return List.of();
        return List.of(wrongGuesses.split(WRONG_GUESS_SEPARATOR));
    }

    public void revealHint() {
        this.hintUsed = true;
    }

    /** 맞힌 시도 — 판이 끝난다 */
    public void solve() {
        this.guessCount = guessCount() + 1;
        complete();
    }

    /**
     * 틀린 시도 — 최신이 앞에 오도록 쌓고 {@link #MAX_WRONG_GUESSES_KEPT} 개만 남긴다.
     * 같은 답을 두 번 적으면 목록에는 한 번만 남는다(횟수는 그대로 센다) — 오타를 고치다 보면
     * 같은 답이 반복되는데, 그걸 그대로 늘어놓으면 그린 사람이 볼 목록이 그것만으로 찬다.
     */
    public void addWrongGuess(String guess) {
        this.guessCount = guessCount() + 1;

        List<String> kept = new ArrayList<>();
        kept.add(guess);
        for (String previous : wrongGuessList()) {
            if (kept.size() >= MAX_WRONG_GUESSES_KEPT) break;
            if (!previous.equalsIgnoreCase(guess)) kept.add(previous);
        }
        this.wrongGuesses = String.join(WRONG_GUESS_SEPARATOR, kept);
    }
}
