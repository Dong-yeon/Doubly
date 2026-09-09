package com.fitto.game.domain;

/**
 * 스도쿠 난이도 — 주어진 숫자(given) 개수로만 나눈다.
 *
 * <p>81칸 중 남기는 개수. 40이면 41칸을 둘이 채운다. 항상 유일해가 되도록 생성기가 보장하므로
 * 난이도가 높아도 "찍어야 풀리는" 판은 나오지 않는다.
 */
public enum GameDifficulty {
    EASY("쉬움", 40),
    NORMAL("보통", 32),
    HARD("어려움", 26);

    private final String label;
    private final int givens;

    GameDifficulty(String label, int givens) {
        this.label = label;
        this.givens = givens;
    }

    public String label() {
        return label;
    }

    public int givens() {
        return givens;
    }
}
