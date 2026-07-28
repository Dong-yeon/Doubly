package com.fitto.chat.dto;

import com.fitto.chat.domain.MessageType;

/**
 * 답장이 인용한 원본 메시지의 요약 — 말풍선 위에 한 줄로 보여준다.
 * 원본 전체를 실어 보내면 삭제·수정된 내용까지 복제되므로 표시에 필요한 최소만 담는다.
 */
public record ReplyPreview(
        Long id,
        Long senderId,
        MessageType messageType,
        /** 본문 미리보기 (삭제된 원본이면 null) */
        String content
) {
}
