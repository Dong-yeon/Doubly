package com.fitto.game.domain;

public enum GameStatus {
    IN_PROGRESS,
    COMPLETED,
    /** 포기 — 기록(history)에 남지 않는다 */
    ABANDONED
}
