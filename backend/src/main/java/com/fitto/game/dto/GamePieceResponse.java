package com.fitto.game.dto;

/**
 * 게임 말 얼굴 — 나와 상대가 고른 우리 이모지. 비었거나 지워진 이모지면 앱이 기본 말로 그린다.
 *
 * @param myEmojiId      내가 고른 이모지 id — 없으면 null
 * @param myImageUrl     그 이모지 그림 — 지워졌으면 null
 * @param partnerEmojiId 상대가 고른 이모지 id — 없으면 null
 * @param partnerImageUrl 그 이모지 그림 — 지워졌으면 null
 */
public record GamePieceResponse(Long myEmojiId, String myImageUrl, Long partnerEmojiId, String partnerImageUrl) {
}
