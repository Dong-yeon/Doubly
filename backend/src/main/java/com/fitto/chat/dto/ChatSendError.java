package com.fitto.chat.dto;

/**
 * STOMP 전송이 거절됐다는 알림 — 보낸 사람에게만 {@code /user/queue/chat-errors} 로 간다.
 *
 * <p>STOMP 발행은 REST 처럼 응답 코드가 없다. 예전엔 서버가 거절(관계 종료·잠긴 팩·검증 실패)해도 앱이 알 길이
 * 없어 말풍선이 "보내는 중"에 멈췄다가 방을 다시 열면 조용히 사라졌다(docs/chat-current-state.md §8-2 ③).
 *
 * @param clientMessageId 거절된 프레임의 멱등키 — 앱이 어느 말풍선인지 짝짓는다. 키 없이 온 프레임(구버전 앱)이면 null
 * @param code            {@code ErrorCode} 이름(예: RELATION_NOT_ACTIVE). 예상 못 한 실패는 INTERNAL_ERROR
 * @param message         사용자에게 그대로 보여 줄 한국어 문구
 */
public record ChatSendError(String clientMessageId, String code, String message) {
}
