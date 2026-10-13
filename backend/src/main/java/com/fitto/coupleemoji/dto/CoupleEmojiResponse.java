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
        /**
         * 이 장을 그린 프롬프트 버전(v1~v5…) — 앱이 움직이는 효과 레이어를 얹을지 정한다.
         *
         * <p>v4 이하는 김·색종이·zzz 같은 효과가 <b>그림 안에</b> 그려져 있어 앱이 효과를 또
         * 얹으면 겹친다. 그 세트는 캐릭터 모션만 준다(docs/COUPLE_EMOJI_ANIMATION_SPEC_2026-09-28.md §5-4).
         */
        String promptVersion,
        LocalDateTime createdAt,
        /**
         * 이 장이 속한 세트의 남은 다시 그리기 횟수(V138) — 같은 세트의 장들은 같은 값을 갖는다. 앱이 "다시 그리기
         * (남은 n번)"을 그린다. 모르면(세트 메타를 같이 읽지 않은 응답) null.
         */
        Integer regenRemaining
) {
    public static CoupleEmojiResponse from(CoupleEmoji e) {
        return from(e, null);
    }

    public static CoupleEmojiResponse from(CoupleEmoji e, Integer regenRemaining) {
        return new CoupleEmojiResponse(e.getId(), e.getBatchId(), e.getEmotion(), e.getEmotion().label(),
                e.getImageUrl(), e.getSubjectUserId(), e.getCreatedBy(), e.isMoodVisible(),
                e.getEmotion().moodEmoji(), e.getPromptVersion(), e.getCreatedAt(), regenRemaining);
    }
}
