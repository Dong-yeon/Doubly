package com.fitto.game.domain;

/** 커플 게임 종류 — couple_games.game_type (단일 테이블 상속 구분자와 같은 값). */
public enum GameType {
    SUDOKU,
    OMOK,
    /** 캐치마인드 — 한 명이 그리고 한 명이 맞힌다(비동기) */
    CATCH_MIND,
    /** 연쇄 퍼즐 대전 — 각자 판에서 연쇄로 방해를 주고받는다(라이브·고스트) */
    PUZZLE_BATTLE,
    /** 길막기 — 9×9 판에서 벽으로 길을 돌리며 반대편 끝줄까지 먼저 간다(턴제) */
    WALL_RACE
}
