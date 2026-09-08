package com.fitto.mood.dto;

import com.fitto.mood.domain.MoodStatus;

import java.time.LocalDateTime;

/**
 * 한 사람의 현재 무드 — {@link MoodResponse} 의 mine/partner 각각에 실린다.
 *
 * @param emoji     유니코드 무드. 우리 이모지를 걸었을 때도 대역이 들어 있어(V81) 이 필드만 읽는
 *                  화면은 예전처럼 동작한다.
 * @param imageUrl  우리 이모지를 걸었으면 그 이미지, 아니면 null. 앱은 <b>있으면 이미지·없으면
 *                  {@code emoji}</b> 로 그린다.
 */
public record MoodEntry(
        String emoji,
        Long coupleEmojiId,
        String imageUrl,
        String message,
        LocalDateTime createdAt
) {
    /** 우리 이모지가 아닌(또는 아직 URL 을 못 찾은) 무드 */
    public static MoodEntry from(MoodStatus status) {
        return of(status, null);
    }

    public static MoodEntry of(MoodStatus status, String imageUrl) {
        return new MoodEntry(status.getEmoji(), status.getCoupleEmojiId(), imageUrl,
                status.getMessage(), status.getCreatedAt());
    }
}
