package com.fitto.chat.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** "같이 먹었어요" 뒤 식단 카드 본문 — 끼니 이름 뒤에만 붙이고, 뒤에 붙은 장소 조각은 보존한다 */
class MealCardDateMarkTest {

    @Test
    void 끼니_이름_뒤에_붙인다() {
        assertThat(ChatService.withDateMark("점심 · 파스타, 샐러드", "점심")).isEqualTo("점심 (데이트) · 파스타, 샐러드");
    }

    @Test
    void 목표_달성_접두어와_장소_조각을_지킨다() {
        assertThat(ChatService.withDateMark("🎯 단백질 목표 달성! · 저녁 · 스테이크 · 🍽 빕스", "저녁"))
                .isEqualTo("🎯 단백질 목표 달성! · 저녁 (데이트) · 스테이크 · 🍽 빕스");
    }

    @Test
    void 이미_붙었으면_그대로다() {
        assertThat(ChatService.withDateMark("점심 (데이트) · 파스타", "점심")).isEqualTo("점심 (데이트) · 파스타");
    }

    @Test
    void 본문이_없으면_끼니만() {
        assertThat(ChatService.withDateMark(null, "아침")).isEqualTo("아침 (데이트)");
    }
}
