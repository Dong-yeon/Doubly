package com.fitto.plan;

import com.fitto.chat.domain.AnimatedSticker;
import com.fitto.chat.domain.MoodPack;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 움직이는 이모티콘·확장 무드팩의 게이팅 판정 — {@code Feature.PREMIUM_STICKER}.
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
            assertThat(AnimatedSticker.isPremiumContent(emoji)).as(emoji).isFalse();
        }
        assertThat(AnimatedSticker.isPremiumContent("🦖")).isFalse();
        assertThat(AnimatedSticker.isPremiumContent("💕")).isFalse();
        assertThat(AnimatedSticker.isPremiumContent(null)).isFalse();
    }

    /** 움직이는 이모티콘이 PRO 스티커 상품의 전부다 — 무료 6종은 맛보기로 남는다. */
    @Test
    void 움직이는_이모티콘은_premium_플래그대로_판정된다() {
        for (AnimatedSticker s : AnimatedSticker.values()) {
            assertThat(AnimatedSticker.isPremiumContent(s.name())).as(s.name()).isEqualTo(s.isPremium());
        }
        assertThat(AnimatedSticker.values()).anyMatch(s -> !s.isPremium());
        assertThat(AnimatedSticker.values()).anyMatch(AnimatedSticker::isPremium);
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
