package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 움직이는 이모티콘 — {@link MessageType#STICKER} 메시지 중 Lottie 애니메이션으로
 * 그려지는 것들. {@code content} 값은 이 enum 의 {@link #name()} 그대로 저장된다
 * ({@link StickerImage}·{@link TouchGesture} 와 같은 방식).
 *
 * <p><b>PRO 상품의 중심이다.</b> 기존 {@link StickerPack} 프리미엄 팩은 유니코드
 * 이모지라 "키보드에 이미 있는 것을 파는" 모양이었다. 움직이는 이모티콘은 키보드에
 * 없다. 판정은 같은 {@code Feature.PREMIUM_STICKER} 를 쓴다 — 사용자에게는
 * "표현이 늘어난다"는 하나의 혜택이고, 게이트를 쪼개면 결제 화면만 길어진다.
 *
 * <p><b>무료 6종은 맛보기다.</b> 전부 잠그면 이 기능이 있다는 것 자체를 모르는 채로
 * 결제 화면을 보게 된다.
 *
 * <p>프론트 {@code frontend/src/constants/animatedStickers.ts} 와 code·premium 이
 * 정확히 짝을 맞춰야 한다 — 두 파일 모두 같은 원본에서 생성했다. 여기서 추가하면
 * 거기도 같이 추가할 것.
 */
public enum AnimatedSticker {

    ANIM_TWO_HEARTS("두근두근", false),
    ANIM_KISS("뽀뽀", false),
    ANIM_LOVE_FACE("사랑스러워", false),
    ANIM_JOY("빵터짐", false),
    ANIM_THUMBS_UP("좋아", false),
    ANIM_PLEADING("제발", false),
    ANIM_HEART("하트", true),
    ANIM_SPARKLING_HEART("반짝하트", true),
    ANIM_HEART_EYES("반함", true),
    ANIM_STAR_STRUCK("감탄", true),
    ANIM_HUG("안아줘", true),
    ANIM_SOB("엉엉", true),
    ANIM_HOLDING_TEARS("울컥", true),
    ANIM_RAGE("화남", true),
    ANIM_HUFF("씩씩", true),
    ANIM_SLEEPING("잘게", true),
    ANIM_ZANY("장난", true),
    ANIM_COOL("여유", true),
    ANIM_PARTY_FACE("신남", true),
    ANIM_PARTY_POPPER("축하", true),
    ANIM_BIRTHDAY_CAKE("생일", true),
    ANIM_GIFT("선물", true),
    ANIM_ROSE("장미", true),
    ANIM_BOUQUET("꽃다발", true),
    ANIM_FIRE("불타오르네", true),
    ANIM_MUSCLE("힘내", true),
    ANIM_PRAY("부탁해", true),
    ANIM_EYES("봐봐", true),
    ANIM_YAWN("졸려", true),
    ANIM_SMILE("흐뭇", true);

    private final String label;
    private final boolean premium;

    AnimatedSticker(String label, boolean premium) {
        this.label = label;
        this.premium = premium;
    }

    public String label() {
        return label;
    }

    public boolean isPremium() {
        return premium;
    }

    public static Optional<AnimatedSticker> from(String code) {
        return Arrays.stream(values()).filter(s -> s.name().equals(code)).findFirst();
    }

    /** 이 content 가 PRO 전용 움직이는 이모티콘인가. 코드가 아니면 false. */
    public static boolean isPremiumContent(String content) {
        return from(content).map(AnimatedSticker::isPremium).orElse(false);
    }
}
