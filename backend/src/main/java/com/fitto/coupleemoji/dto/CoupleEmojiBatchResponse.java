package com.fitto.coupleemoji.dto;

import java.util.List;

/**
 * 생성 작업의 결과({@code GET /ai/jobs/{jobId}} 의 result).
 *
 * @param emojis         살린 장들 — 이미 저장돼 있다(자동 저장, §4). 마음에 안 드는 장은 개별 삭제.
 * @param failedEmotions 못 만든 감정 — 6장 중 1장이 안전필터에 걸렸다고 세트 전체를 버리지 않는다.
 *                       앱은 "N장은 만들지 못했어요" 정도로만 알린다.
 */
public record CoupleEmojiBatchResponse(
        String batchId,
        List<CoupleEmojiResponse> emojis,
        List<String> failedEmotions
) {
}
