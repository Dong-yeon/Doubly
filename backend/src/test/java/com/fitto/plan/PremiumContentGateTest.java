package com.fitto.plan;

import com.fitto.chat.domain.AnimatedSticker;
import com.fitto.chat.domain.MoodPack;
import com.fitto.chat.domain.StickerPacks;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 무료로 준 것을 서버가 막지 않는가 — 유니코드 이모지 · 움직이는 이모티콘 · 기본 무드.
 *
 * <p>서버가 "이 문자열이 유료 콘텐츠인가"를 정확히 가려야 두 가지 사고를 막는다:
 * ① 유료 세트가 공짜로 새어나가는 것, ② <b>원래 자유롭게 쓰던 이모지가 갑자기 막히는 것</b>.
 * 두 번째가 더 나쁘다 — 새 상품이 아니라 기능 회수로 체감된다.
 *
 * <p>②가 실제로 일어났었다. 시즌 스티커 팩(유니코드 40종)이 유료였는데 무료 이모지 시트
 * 96종과 12종이 겹쳐, 무료라고 보여 준 이모지를 서버만 막았다. 예전 테스트는 팩 <b>안에서만</b>
 * 따져서 이 겹침을 못 봤다 — 아래 {@code 유니코드_이모지는_무엇이든_무료다} 가 그 자리를 대신한다.
 */
class PremiumContentGateTest {

    /**
     * 2026-09-14 결정 — 유니코드 이모지는 유료 판정 대상이 아니다.
     *
     * <p>폰 키보드에 이미 있는 글자라 "파는 것"이 성립하지 않았다(AnimatedSticker 주석).
     * 여기 목록은 <b>예전에 막혔던 것들</b>이다 — 시즌 팩 대표값과, 무료 시트와 겹쳐 사고를
     * 냈던 12종. 이 테스트가 깨지면 그 기능 회수가 되돌아온 것이다.
     */
    @Test
    void 유니코드_이모지는_무엇이든_무료다() {
        List<String> onceBlocked = List.of(
                "🌸", "☔", "🌊", "🏖️", "🍦", "🍁", "☕", "❄️", "🎄", "🔥", "🎂", "💐",
                "🌷", "🦋", "🍉", "🎃", "⛄", "🎁", "💍", "👑");
        for (String emoji : onceBlocked) {
            assertThat(StickerPacks.ofStickerContent(emoji)).as(emoji).isNull();
        }
        assertThat(StickerPacks.ofStickerContent("🦖")).isNull();
        assertThat(StickerPacks.ofStickerContent("💕")).isNull();
        assertThat(StickerPacks.ofStickerContent(null)).isNull();
    }

    /**
     * <b>움직이는 이모티콘도 전부 무료가 됐다</b>(2026-09-21).
     *
     * <p>2026-09-14 에는 "유니코드 이모지는 팔 수 없다"까지만 갔고 움직이는 이모티콘 24종은
     * PRO 로 남겼다. 같은 논리를 끝까지 적용하면 그쪽도 결국 키보드에 있는 글자다 —
     * 움직인다는 것만으로는 상품 근거가 얇았다. 이제 파는 것은 유니코드에 <b>없는</b>
     * 것뿐이다: 캐릭터 스티커(낱개 구매)와 우리 이모지(PRO 구독).
     *
     * <p>이 테스트가 깨지면 그 회귀다 — 무료로 주던 이모티콘을 다시 잠근 것이고,
     * 그건 새 상품이 아니라 기능 회수로 체감된다.
     */
    @Test
    void 움직이는_이모티콘은_전부_무료다() {
        for (AnimatedSticker s : AnimatedSticker.values()) {
            assertThat(s.packId()).as(s.name()).startsWith("ANIM_");
        }
        // 팩이 잡히기는 해야 한다 — null 이면 판정을 지나지 않아 "무료"가 우연이 된다
        assertThat(StickerPacks.ofStickerContent("ANIM_HEART")).isEqualTo(StickerPacks.ANIM_LOVE);
        assertThat(StickerPacks.ofStickerContent("ANIM_PARTY_POPPER")).isEqualTo(StickerPacks.ANIM_CELEBRATE);
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
