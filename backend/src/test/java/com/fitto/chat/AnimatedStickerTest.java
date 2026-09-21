package com.fitto.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.fitto.chat.domain.AnimatedSticker;
import com.fitto.chat.domain.StickerPacks;
import java.util.Arrays;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 움직이는 이모티콘 카탈로그 — 프론트({@code animatedStickers.ts})와 짝이 맞아야 하는
 * 값들을 고정한다. 두 파일은 같은 원본에서 생성했지만, 이후 한쪽만 손대면 앱에는
 * 보이는데 서버가 막는 이모티콘이 생긴다.
 *
 * <p>코드 ↔ 팩 대조는 {@code StickerPackSyncTest} 가 한다. 여기는 <b>이 enum 하나만으로
 * 성립하는 불변식</b>을 본다.
 */
class AnimatedStickerTest {

    /** 무료 8팩 — 유료 팩이 섞이면 이 목록에서 빠져 아래 테스트가 잡는다. */
    private static final Set<String> FREE_PACKS = Set.of(
            StickerPacks.ANIM_LOVE, StickerPacks.ANIM_FUN, StickerPacks.ANIM_UPSET,
            StickerPacks.ANIM_CELEBRATE, StickerPacks.ANIM_CHEER, StickerPacks.ANIM_ANIMAL,
            StickerPacks.ANIM_FOOD, StickerPacks.ANIM_WEATHER);

    @Test
    @DisplayName("110종 — 8팩으로 나뉜다")
    void catalogSize() {
        assertThat(AnimatedSticker.values()).hasSize(110);
        assertThat(Arrays.stream(AnimatedSticker.values()).map(AnimatedSticker::packId).distinct())
                .hasSize(8);
    }

    /**
     * <b>움직이는 이모티콘은 전부 무료다</b>(2026-09-21).
     *
     * <p>수익화를 세 갈래로 나누면서(캐릭터 스티커=낱개, 우리 이모지=구독, 이쪽=무료)
     * 예전 PRO 24종을 통째로 열었다. 여기가 깨지면 유니코드에 이미 있는 그림을 다시
     * 팔기 시작한 것이다 — 2026-09-14 에 폐지한 바로 그 모양이다.
     */
    @Test
    @DisplayName("모든 이모티콘이 무료 팩에 속한다")
    void everyStickerIsInAFreePack() {
        for (AnimatedSticker s : AnimatedSticker.values()) {
            assertThat(s.packId()).as(s.name()).isIn(FREE_PACKS);
        }
    }

    @Test
    @DisplayName("이모지·이미지 스티커·null 은 이 카탈로그에 없다")
    void nonAnimatedContentIsNotFound() {
        assertThat(AnimatedSticker.from("💕")).isEmpty();
        assertThat(AnimatedSticker.from("LOVE_BEAR")).isEmpty();
        assertThat(AnimatedSticker.from(null)).isEmpty();
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
