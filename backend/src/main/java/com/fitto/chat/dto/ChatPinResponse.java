package com.fitto.chat.dto;

/**
 * 공지 고정 상태 — relationId 는 항상 채워지고(브로드캐스트 대상 결정용),
 * pinned 는 현재 고정된 메시지(없으면 null, 즉 해제된 상태).
 */
public record ChatPinResponse(
        Long relationId,
        ChatMessageResponse pinned
) {
}
