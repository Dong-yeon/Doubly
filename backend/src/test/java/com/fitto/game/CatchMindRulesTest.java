package com.fitto.game;

import com.fitto.game.catchmind.Answers;
import com.fitto.game.catchmind.CatchMindWords;
import com.fitto.game.catchmind.Strokes;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/** 캐치마인드의 순수 규칙 — 정답 판정·초성·그림 형식. */
class CatchMindRulesTest {

    // ── 정답 판정 ────────────────────────────────────────────────────────

    @Test
    void 띄어쓰기와_문장부호는_무시한다() {
        assertThat(Answers.matches("고양이", "고양이")).isTrue();
        assertThat(Answers.matches("고양이", " 고양이! ")).isTrue();
        assertThat(Answers.matches("고양이", "고 양 이")).isTrue();
        assertThat(Answers.matches("계란프라이", "계란 프라이")).isTrue();
    }

    @Test
    void 유의어는_받지_않는다() {
        // 여기까지 받아주면 무엇이 정답인지 서로 납득할 수 없다 — 출구는 초성과 포기다
        assertThat(Answers.matches("강아지", "개")).isFalse();
        assertThat(Answers.matches("고양이", "야옹이")).isFalse();
        assertThat(Answers.matches("고양이", "")).isFalse();
    }

    // ── 초성 ────────────────────────────────────────────────────────────

    @Test
    void 초성_힌트는_받침과_무관하게_첫_자음만_뽑는다() {
        assertThat(Answers.hint("고양이")).isEqualTo("ㄱㅇㅇ");
        assertThat(Answers.hint("떡볶이")).isEqualTo("ㄸㅂㅇ");
        assertThat(Answers.hint("눈사람")).isEqualTo("ㄴㅅㄹ");
    }

    @Test
    void 한글이_아닌_글자와_공백은_그대로_둔다() {
        // 공백이 남아야 몇 단어인지 보인다
        assertThat(Answers.hint("계란 프라이")).isEqualTo("ㄱㄹ ㅍㄹㅇ");
        // 한글 음절은 섞여 있어도 초성으로 바뀐다 — 그대로 두는 건 한글이 아닌 글자뿐이다
        assertThat(Answers.hint("A급 태풍")).isEqualTo("Aㄱ ㅌㅍ");
        assertThat(Answers.hint("3단 우산")).isEqualTo("3ㄷ ㅇㅅ");
        assertThat(Answers.hint(null)).isEmpty();
    }

    // ── 그림 형식 ────────────────────────────────────────────────────────

    @Test
    void 올바른_획_문자열을_받는다() {
        assertThat(Strokes.isValid("0,1,10,20,15,25")).isTrue();
        assertThat(Strokes.isValid("0,1,10,20,15,25;2,0,100,100,120,130")).isTrue();
        assertThat(Strokes.isValid("5,2,0,0,1000,1000")).isTrue();
    }

    @Test
    void 점_하나짜리_획도_받는다() {
        /*
         * 앱에서 캔버스를 톡 치면(움직이지 않고 떼면) 점이 하나인 획이 나온다 — "색,굵기,x,y".
         * 서버가 이걸 거절하면 사용자는 점을 찍을 수 없고, 그 사실을 전송 단계에서야 안다.
         * DrawingCanvas.serializeStrokes 가 만드는 형식과 짝이다.
         */
        assertThat(Strokes.isValid("0,1,500,500")).isTrue();
        assertThat(Strokes.isValid("0,1,500,500;1,2,10,10,20,20")).isTrue();
    }

    @Test
    void 깨진_획은_거절한다() {
        assertThat(Strokes.isValid(null)).isFalse();
        assertThat(Strokes.isValid("")).isFalse();
        assertThat(Strokes.isValid("   ")).isFalse();
        assertThat(Strokes.isValid("0,1,10")).isFalse();          // 좌표가 홀수 개 → 렌더가 깨진다
        assertThat(Strokes.isValid("0,1")).isFalse();             // 점이 없다
        assertThat(Strokes.isValid("0,1,10,20;")).isFalse();      // 빈 획
        assertThat(Strokes.isValid("0,1,10,-20")).isFalse();      // 음수
        assertThat(Strokes.isValid("0,1,10,abc")).isFalse();
        assertThat(Strokes.isValid("0,1,10,1001")).isFalse();     // 좌표계 밖
    }

    @Test
    void 너무_큰_그림은_거절한다() {
        String huge = "0,1" + ",10,20".repeat(Strokes.MAX_LENGTH);
        assertThat(huge.length()).isGreaterThan(Strokes.MAX_LENGTH);
        assertThat(Strokes.isValid(huge)).isFalse();
    }

    // ── 제시어 ──────────────────────────────────────────────────────────

    @Test
    void 후보는_서로_다른_카테고리에서_나온다() {
        List<CatchMindWords.Candidate> candidates = CatchMindWords.candidates(new Random(42), 3);
        assertThat(candidates).hasSize(3);
        assertThat(candidates).extracting(CatchMindWords.Candidate::category).doesNotHaveDuplicates();
        assertThat(candidates).allSatisfy(c -> assertThat(c.word()).isNotBlank());
    }

    @Test
    void 카테고리보다_많이_요구하면_있는_만큼만_준다() {
        assertThat(CatchMindWords.candidates(new Random(1), 100))
                .extracting(CatchMindWords.Candidate::category)
                .doesNotHaveDuplicates();
        assertThat(CatchMindWords.size()).isGreaterThan(100);
    }
}
