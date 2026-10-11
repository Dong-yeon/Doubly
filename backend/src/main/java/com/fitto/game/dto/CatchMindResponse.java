package com.fitto.game.dto;

import com.fitto.game.domain.CatchMindGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.catchmind.Answers;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 캐치마인드 판 응답 — 요청자가 그린 사람인지 맞히는 사람인지에 따라 다르게 채워진다.
 *
 * @param role         DRAWER(내가 그렸다) / GUESSER(내가 맞힌다)
 * @param word         <b>맞히는 사람에게는 끝나기 전까지 null</b>. 끝난 판에서는 양쪽 다 본다
 * @param wordLength   글자 수 — 맞히는 사람이 몇 글자인지는 알아야 시작할 수 있다
 * @param hint         초성 — 열었을 때만. 그린 사람에게는 항상 준다(상대가 뭘 보는지 알아야 하므로)
 * @param wrongGuesses 틀린 시도(최신 순) — 그린 사람이 보는 재미가 이 게임의 절반이다
 */
public record CatchMindResponse(
        Long id,
        GameStatus status,
        String role,
        String strokes,
        String word,
        int wordLength,
        String hint,
        boolean hintUsed,
        List<String> wrongGuesses,
        int guessCount,
        String partnerName,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
    public static CatchMindResponse of(CatchMindGame game, Long viewerId, String partnerName) {
        boolean drawer = game.isDrawer(viewerId);
        boolean finished = game.getStatus() != GameStatus.IN_PROGRESS;
        /*
         * 제시어는 그린 사람과 "이미 끝난 판"에만 내려간다. 맞히는 중인 사람에게 내려가면
         * 앱을 뜯지 않아도 응답만 보면 정답이 보인다 — 스도쿠 solution 과 같은 이유다.
         */
        boolean revealWord = drawer || finished;

        return new CatchMindResponse(
                game.getId(),
                game.getStatus(),
                drawer ? "DRAWER" : "GUESSER",
                game.getStrokes(),
                revealWord ? game.getWord() : null,
                game.getWord() == null ? 0 : game.getWord().length(),
                drawer || game.isHintUsed() ? Answers.hint(game.getWord()) : null,
                game.isHintUsed(),
                game.wrongGuessList(),
                game.guessCount(),
                partnerName,
                game.getCreatedAt(),
                game.getCompletedAt()
        );
    }
}
