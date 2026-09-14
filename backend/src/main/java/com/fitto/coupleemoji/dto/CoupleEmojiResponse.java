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
        /**
         * 이 감정이 대신하는 기본 무드 유니코드 — 무드 피커가 <b>어느 칸을 덮을지</b> 정하는 열쇠다.
         *
         * <p>매핑은 {@link CoupleEmojiEmotion#moodEmoji()} 가 갖고 있다. 앱이 같은 표를 또
         * 들고 있으면 감정을 하나 더할 때마다 두 곳을 고쳐야 하므로 서버가 실어 보낸다 —
         * {@code label} 을 응답에 싣는 것과 같은 이유다.
         *
         * <p><b>여러 감정이 같은 값을 가질 수 있다</b>(😊 = 기쁨·씻고왔다·퇴근·마스크팩).
         * 한 칸을 누가 차지할지는 앱이 정한다(MoodPicker 주석 참고).
         */
        String moodEmoji,
        LocalDateTime createdAt
) {
    public static CoupleEmojiResponse from(CoupleEmoji e) {
        return new CoupleEmojiResponse(e.getId(), e.getBatchId(), e.getEmotion(), e.getEmotion().label(),
                e.getImageUrl(), e.getSubjectUserId(), e.getCreatedBy(), e.isMoodVisible(),
                e.getEmotion().moodEmoji(), e.getCreatedAt());
    }
}
