package com.fitto.chat.domain;

import java.util.List;

/**
 * 무드 아이콘 팩 — 기본 12종(무료)과 확장 세트(PRO, {@code Feature.PREMIUM_STICKER}).
 *
 * <p>스티커와 <b>같은 Feature 로 판정</b>한다. 둘 다 원가 0의 꾸미기이고, 사용자에게도
 * "표현이 늘어난다"는 하나의 혜택으로 읽힌다 — 게이트를 쪼개면 결제 화면의 혜택 목록만
 * 길어지고 무엇을 사는지가 흐려진다.
 *
 * <p>프론트 {@code frontend/src/constants/moodEmojis.ts} 와 목록이 짝을 맞춰야 한다.
 *
 * <p><b>목록에 없는 이모지는 무료다.</b> 무드는 원래 서버가 목록을 강제하지 않고 길이만
 * 검증했다(신뢰 경계 밖). 그 관대함을 유지한 채, <b>확장 세트로 파는 것만</b> 막는다.
 */
public final class MoodPack {

    /** 확장 무드 — 기본 12종으로는 표현이 안 되던 결들. */
    public static final List<String> PREMIUM = List.of(
            "🤩", "🥲", "😌", "🫶", "🙃", "😳",
            "🥶", "🥵", "🤯", "😇", "🫥", "🤠");

    private MoodPack() {
    }

    public static boolean isPremium(String emoji) {
        return emoji != null && PREMIUM.contains(emoji);
    }
}
