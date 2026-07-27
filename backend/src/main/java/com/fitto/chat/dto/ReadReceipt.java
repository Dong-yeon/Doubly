package com.fitto.chat.dto;

/**
 * 읽음 확인 — /sub/rooms/{relationId}/read 로 발행한다.
 *
 * <p>메시지 스트림(/sub/rooms/{relationId})과 채널을 분리한 이유: 기존 구독자는 그 채널의
 * 페이로드를 항상 {@link ChatMessageResponse} 로 파싱한다. 다른 모양을 섞으면 구버전
 * 클라이언트가 깨진다.
 *
 * @param readerId          읽은 사람 (수신자) — 발신자는 자기 id 가 아닌 경우만 반영한다
 * @param lastReadMessageId 이 id 이하의 메시지가 모두 읽힘
 */
public record ReadReceipt(Long readerId, Long lastReadMessageId) {
}
