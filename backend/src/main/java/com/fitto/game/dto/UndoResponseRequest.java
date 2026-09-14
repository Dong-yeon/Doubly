package com.fitto.game.dto;

/** 무르기 응답 — accept=false 는 "그냥 두자"(요청만 지운다) */
public record UndoResponseRequest(boolean accept) {
}
