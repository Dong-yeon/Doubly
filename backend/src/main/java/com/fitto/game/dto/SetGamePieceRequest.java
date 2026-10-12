package com.fitto.game.dto;

/** 게임 말 얼굴 고르기 — emojiId 가 null 이면 기본 말로 되돌린다 */
public record SetGamePieceRequest(Long emojiId) {
}
