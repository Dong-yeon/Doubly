package com.fitto.coupleemoji.dto;

import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;

import java.time.LocalDateTime;

/** 우리 이모지 한 장 — 트레이·미리보기 공용 */
public record CoupleEmojiResponse(
        Long id,
        String batchId,
        CoupleEmojiEmotion emotion,
        /** 감정 한국어 라벨(화남·기쁨·…) — 트레이 툴팁·접근성 라벨 */
        String label,
        String imageUrl,
        Long subjectUserId,
        Long createdBy,
        /** 무드 피커에 올라가는가 — 앱이 토글 상태를 그린다 */
        boolean moodVisible,
        LocalDateTime createdAt
) {
    public static CoupleEmojiResponse from(CoupleEmoji e) {
        return new CoupleEmojiResponse(e.getId(), e.getBatchId(), e.getEmotion(), e.getEmotion().label(),
                e.getImageUrl(), e.getSubjectUserId(), e.getCreatedBy(), e.isMoodVisible(), e.getCreatedAt());
    }
}
