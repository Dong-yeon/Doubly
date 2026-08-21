package com.fitto.plan;

import com.fitto.chat.domain.MoodPack;
import com.fitto.chat.domain.StickerPack;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 시즌 스티커·확장 무드팩의 게이팅 판정 — {@code Feature.PREMIUM_STICKER}.
 *
 * <p>서버가 "이 문자열이 유료 콘텐츠인가"를 정확히 가려야 두 가지 사고를 막는다:
 * ① 유료 세트가 공짜로 새어나가는 것, ② <b>원래 자유롭게 쓰던 이모지가 갑자기 막히는 것</b>.
 * 두 번째가 더 나쁘다 — 새 상품이 아니라 기능 회수로 체감된다.
 */
class PremiumContentGateTest {

    @Test
    void 기본_스티커는_무료다() {
        for (String sticker : StickerPack.BASIC.stickers()) {
            assertThat(StickerPack.isPremium(sticker)).as(sticker).isFalse();
        }
    }

    @Test
    void 시즌_스티커는_유료다() {
        for (StickerPack pack : StickerPack.values()) {
            if (!pack.isPremium()) continue;
            for (String sticker : pack.stickers()) {
                assertThat(StickerPack.isPremium(sticker)).as(pack + " " + sticker).isTrue();
            }
        }
    }

    /** 이모지 시트에서 직접 고른 임의 이모지는 예전처럼 자유롭게 보낼 수 있어야 한다. */
    @Test
    void 어느_팩에도_없는_이모지는_무료다() {
        assertThat(StickerPack.isPremium("🦖")).isFalse();
        assertThat(StickerPack.isPremium("🍕")).isFalse();
        assertThat(StickerPack.isPremium(null)).isFalse();
    }

    /** 같은 이모지가 무료 팩과 유료 팩에 함께 있으면 판정이 순서에 좌우된다. */
    @Test
    void 팩_사이에_중복된_스티커가_없다() {
        Set<String> seen = new HashSet<>();
        for (StickerPack pack : StickerPack.values()) {
            for (String sticker : pack.stickers()) {
                assertThat(seen.add(sticker)).as("%s 가 두 팩에 있음", sticker).isTrue();
            }
        }
    }

    @Test
    void 확장_무드는_유료이고_기본_무드는_무료다() {
        for (String emoji : MoodPack.PREMIUM) {
            assertThat(MoodPack.isPremium(emoji)).as(emoji).isTrue();
        }
        // 기본 12종 중 대표값 — 프론트 moodEmojis.ts 와 짝을 맞춘다
        assertThat(MoodPack.isPremium("😊")).isFalse();
        assertThat(MoodPack.isPremium("😴")).isFalse();
        assertThat(MoodPack.isPremium(null)).isFalse();
    }
}
