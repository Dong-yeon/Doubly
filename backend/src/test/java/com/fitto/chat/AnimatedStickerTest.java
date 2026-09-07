package com.fitto.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.fitto.chat.domain.AnimatedSticker;
import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 움직이는 이모티콘 카탈로그 — 프론트({@code animatedStickers.ts})와 짝이 맞아야 하는
 * 값들을 고정한다. 두 파일은 같은 원본에서 생성했지만, 이후 한쪽만 손대면 앱에는
 * 보이는데 서버가 막는 이모티콘이 생긴다.
 */
class AnimatedStickerTest {

    @Test
    @DisplayName("30종 — 무료 6 / PRO 24")
    void catalogSize() {
        assertThat(AnimatedSticker.values()).hasSize(30);
        assertThat(Arrays.stream(AnimatedSticker.values()).filter(s -> !s.isPremium())).hasSize(6);
        assertThat(Arrays.stream(AnimatedSticker.values()).filter(AnimatedSticker::isPremium)).hasSize(24);
    }

    @Test
    @DisplayName("무료 맛보기는 잠기지 않는다")
    void freeOnesAreNotGated() {
        assertThat(AnimatedSticker.isPremiumContent("ANIM_TWO_HEARTS")).isFalse();
        assertThat(AnimatedSticker.isPremiumContent("ANIM_KISS")).isFalse();
    }

    @Test
    @DisplayName("PRO 이모티콘은 잠긴다")
    void premiumOnesAreGated() {
        assertThat(AnimatedSticker.isPremiumContent("ANIM_HEART")).isTrue();
        assertThat(AnimatedSticker.isPremiumContent("ANIM_PARTY_POPPER")).isTrue();
    }

    @Test
    @DisplayName("이모지·이미지 스티커·null 은 이 게이트에 걸리지 않는다")
    void nonAnimatedContentIsNotGated() {
        assertThat(AnimatedSticker.isPremiumContent("💕")).isFalse();
        assertThat(AnimatedSticker.isPremiumContent("LOVE_BEAR")).isFalse();
        assertThat(AnimatedSticker.isPremiumContent(null)).isFalse();
        assertThat(AnimatedSticker.from("없는코드")).isEmpty();
    }

    @Test
    @DisplayName("모든 항목에 사람이 읽을 라벨이 있다 — 알림 미리보기에 그대로 쓰인다")
    void everyEntryHasLabel() {
        for (AnimatedSticker s : AnimatedSticker.values()) {
            assertThat(s.label()).as(s.name()).isNotBlank();
            assertThat(s.name()).as(s.name()).startsWith("ANIM_");
        }
    }
}
