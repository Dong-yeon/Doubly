package com.fitto.chat.dto;

import com.fitto.chat.domain.MessageType;

/**
 * STOMP 로 수신하는 메시지 전송 페이로드.
 * 텍스트: content / 운동 카드: messageType=WORKOUT_CARD + workoutId.
 * 답장: replyToId 에 인용할 메시지 id (같은 방의 메시지여야 한다 — 서비스에서 검증).
 *
 * @param clientMessageId 앱이 만든 멱등키. 같은 키로 다시 오면 서버는 새로 저장하지 않고
 *                        먼저 저장된 메시지를 그대로 돌려준다({@code ChatService.send}).
 *                        앱은 이 값으로 낙관적 말풍선과 서버 에코를 짝짓는다.
 *                        구버전 앱·시스템 카드는 보내지 않으므로 null 을 허용한다.
 */
public record SendMessageRequest(
        MessageType messageType,
        String content,
        String imageUrl,
        Long workoutId,
        Long routineId,
        Long replyToId,
        String clientMessageId
) {
    /** 멱등키 없이 — 키를 싣지 않는 경로(테스트·구버전 앱)를 위한 오버로드 */
    public SendMessageRequest(MessageType messageType, String content, String imageUrl,
                              Long workoutId, Long routineId, Long replyToId) {
        this(messageType, content, imageUrl, workoutId, routineId, replyToId, null);
    }
}
