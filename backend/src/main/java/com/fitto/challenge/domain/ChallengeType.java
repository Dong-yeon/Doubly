package com.fitto.challenge.domain;

/** 챌린지 종류 — 무엇으로 겨루는가 */
public enum ChallengeType {
    WORKOUT("운동"),
    MEAL("식단");

    private final String label;

    ChallengeType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
