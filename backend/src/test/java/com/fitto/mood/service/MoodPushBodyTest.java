package com.fitto.mood.service;

import org.junit.jupiter.api.Test;

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

    @Test
    void 앞뒤_공백은_걷어낸다() {
        assertThat(MoodService.pushBody("보리", "🥰", "  보고 싶어 ")).isEqualTo("보리님 지금 기분: 🥰 “보고 싶어”");
    }
}
