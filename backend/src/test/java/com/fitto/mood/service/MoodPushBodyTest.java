package com.fitto.mood.service;

import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/** 무드 푸시 본문 — 한마디가 상대 알림에 실린다. 스프링 없이 문자열만 본다. */
class MoodPushBodyTest {

    @Test
    void 한마디가_있으면_따옴표로_붙인다() {
        assertThat(MoodService.pushBody("보리", "😴", "야근 중")).isEqualTo("보리님 지금 기분: 😴 “야근 중”");
    }

    @Test
    void 한마디가_없거나_공백이면_이모지만() {
        assertThat(MoodService.pushBody("보리", "😊", null)).isEqualTo("보리님 지금 기분: 😊");
        assertThat(MoodService.pushBody("보리", "😊", "   ")).isEqualTo("보리님 지금 기분: 😊");
    }

    /**
     * 우리 이모지 무드 — 표정 6종은 대역 이모지가 같은 뜻이라 그대로, 나머지는 대역(배고파 → 🫠 녹음)이
     * 아니라 이름을 싣는다. 예전엔 배고파를 건 사람의 상대가 "지금 기분: 🫠"을 받았다(2026-10-07).
     */
    @Test
    void 우리_이모지는_표정이면_대역_아니면_이름() {
        assertThat(MoodService.pushBody("보리", CoupleEmojiEmotion.ANGRY.moodText(), null)).isEqualTo("보리님 지금 기분: 😤");
        assertThat(MoodService.pushBody("보리", CoupleEmojiEmotion.HUNGRY.moodText(), null)).isEqualTo("보리님 지금 기분: 배고파");
        assertThat(MoodService.pushBody("보리", CoupleEmojiEmotion.HARD_AT_WORK.moodText(), "곧 끝나"))
                .isEqualTo("보리님 지금 기분: 열일 “곧 끝나”");

        // 표정 6종 = 무드 피커 기본 칸을 덮는 것 = 처음부터 무드에 올라가는 것(defaultMoodVisible)
        assertThat(Arrays.stream(CoupleEmojiEmotion.values()).filter(CoupleEmojiEmotion::isFace))
                .containsExactly(CoupleEmojiEmotion.ANGRY, CoupleEmojiEmotion.HAPPY, CoupleEmojiEmotion.EXCITED,
                        CoupleEmojiEmotion.SAD, CoupleEmojiEmotion.SLEEPY, CoupleEmojiEmotion.LOVE);
        // 표정끼리는 대역이 겹치지 않는다 — 겹치면 무드 피커에서 한 칸을 두 얼굴이 다툰다
        assertThat(Arrays.stream(CoupleEmojiEmotion.values()).filter(CoupleEmojiEmotion::isFace)
                .map(CoupleEmojiEmotion::moodEmoji)).doesNotHaveDuplicates();
    }

    @Test
    void 앞뒤_공백은_걷어낸다() {
        assertThat(MoodService.pushBody("보리", "🥰", "  보고 싶어 ")).isEqualTo("보리님 지금 기분: 🥰 “보고 싶어”");
    }
}
