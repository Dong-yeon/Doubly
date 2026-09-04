package com.fitto.chat.dto;

import java.util.List;

/**
 * 대화 내보내기 응답 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위.
 * 실제 텍스트 파일 조립은 프론트가 한다(발신자 이름 표시가 화면 쪽 정보라서) — 여기선
 * 메시지 원본과, 상한에 걸려 잘렸는지만 알려준다.
 */
public record ChatExportResponse(
        List<ChatMessageResponse> messages,
        long totalCount,
        /** true 면 totalCount 가 messages.size() 보다 많다 — 기간을 좁혀 다시 받아야 전체를 받는다 */
        boolean truncated
) {
}
