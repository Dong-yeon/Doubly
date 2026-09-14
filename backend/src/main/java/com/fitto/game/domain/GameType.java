package com.fitto.game.domain;

/** 커플 게임 종류 — couple_games.game_type (단일 테이블 상속 구분자와 같은 값). */
public enum GameType {
    SUDOKU,
    OMOK,
    /** 캐치마인드 — 한 명이 그리고 한 명이 맞힌다(비동기) */
    CATCH_MIND
}
