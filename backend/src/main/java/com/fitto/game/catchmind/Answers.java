package com.fitto.game.catchmind;

/**
 * 캐치마인드 정답 판정과 초성 힌트 — 순수 계산이라 테스트가 직접 검증한다.
 */
public final class Answers {

    /** 한글 음절의 시작 코드포인트 '가' */
    private static final char HANGUL_BASE = 0xAC00;
    /** 초성 하나가 담당하는 음절 수 = 중성 21 × 종성 28 */
    private static final int SYLLABLES_PER_CHOSUNG = 588;
    private static final char[] CHOSUNG = {
            'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
            'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    };

    private Answers() {
    }

    /**
     * 맞았는가 — 띄어쓰기와 문장부호는 무시한다.
     *
     * <p>"고양이!"·"고 양이"를 틀렸다고 하면 게임이 아니라 받아쓰기가 된다. 반대로 유의어까지
     * 받아주지는 않는다("강아지"에 "개"). 거기까지 가면 무엇이 정답인지 서로 납득할 수 없고,
     * 막혔을 때의 출구는 유의어가 아니라 {@link #hint} 와 포기다.
     */
    public static boolean matches(String word, String guess) {
        return normalize(word).equalsIgnoreCase(normalize(guess));
    }

    /** 비교용 정규화 — 공백·문장부호 제거 */
    public static String normalize(String value) {
        if (value == null) return "";
        StringBuilder sb = new StringBuilder(value.length());
        for (char c : value.toCharArray()) {
            if (Character.isLetterOrDigit(c)) sb.append(c);
        }
        return sb.toString();
    }

    /**
     * 초성 힌트 — "고양이" → "ㄱㅇㅇ". 한글이 아닌 글자는 그대로 둔다(숫자·영문 제시어 대비).
     * 공백은 그대로 남겨 몇 단어인지 보이게 한다.
     */
    public static String hint(String word) {
        if (word == null) return "";
        StringBuilder sb = new StringBuilder(word.length());
        for (char c : word.toCharArray()) {
            int offset = c - HANGUL_BASE;
            if (offset >= 0 && offset < CHOSUNG.length * SYLLABLES_PER_CHOSUNG) {
                sb.append(CHOSUNG[offset / SYLLABLES_PER_CHOSUNG]);
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
