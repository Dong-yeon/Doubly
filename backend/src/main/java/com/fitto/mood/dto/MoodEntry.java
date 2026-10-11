package com.fitto.mood.dto;

import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.mood.domain.MoodStatus;

import java.time.LocalDateTime;

/**
 * 한 사람의 현재 무드 — {@link MoodResponse} 의 mine/partner 각각에 실린다.
 *
 * @param emoji     유니코드 무드. 우리 이모지를 걸었을 때도 대역이 들어 있어(V81) 이 필드만 읽는
 *                  화면은 예전처럼 동작한다.
 * @param imageUrl  우리 이모지를 걸었으면 그 이미지, 아니면 null. 앱은 <b>있으면 이미지·없으면
 *                  {@code emoji}</b> 로 그린다.
 * @param moodText  그림을 못 그리고 <b>글자로만</b> 보여 주는 자리(안드로이드 홈 위젯)에 쓸 말. 대개 {@code emoji}
 *                  와 같고, 표정이 아닌 우리 이모지면 그 이름(배고파)이다 — 대역(🫠 녹음)은 같은 뜻이 아니다
 *                  ({@code CoupleEmojiEmotion.moodText}, 푸시 본문과 같은 값).
 */
public record MoodEntry(
        String emoji,
        Long coupleEmojiId,
        String imageUrl,
        String moodText,
        String message,
        LocalDateTime createdAt
) {
    /** 우리 이모지가 아닌(또는 숨겨져 유니코드로 되돌린) 무드 */
    public static MoodEntry from(MoodStatus status) {
        return new MoodEntry(status.getEmoji(), status.getCoupleEmojiId(), null, status.getEmoji(),
                status.getMessage(), status.getCreatedAt());
    }

    /** 우리 이모지 무드 — 그림과 감정에서 나온 글자를 함께 싣는다 */
    public static MoodEntry of(MoodStatus status, CoupleEmoji emoji) {
        return new MoodEntry(status.getEmoji(), status.getCoupleEmojiId(), emoji.getImageUrl(),
                emoji.getEmotion().moodText(), status.getMessage(), status.getCreatedAt());
    }
}
