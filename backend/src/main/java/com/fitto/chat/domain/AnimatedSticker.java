package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 움직이는 이모티콘 — {@link MessageType#STICKER} 메시지 중 Lottie 애니메이션으로
 * 그려지는 것들. {@code content} 값은 이 enum 의 {@link #name()} 그대로 저장된다
 * ({@link StickerImage}·{@link TouchGesture} 와 같은 방식).
 *
 * <p><b>PRO 스티커 상품은 이제 이것뿐이다.</b> 예전엔 시즌 이모지 팩 5개(유니코드 40종)도
 * 함께 잠갔는데, 파는 것이 "키보드에 이미 있는 글자"라 상품으로서 근거가 약했다. 그 약함이
 * 실제 사고로도 나타났다 — 무료 이모지 시트 96종과 12종이 겹쳐, 무료라고 보여 준 이모지를
 * 서버가 막고 말풍선이 "전송 중"에서 멈췄다. 2026-09-14 에 팩을 폐지하고 유니코드 이모지는
 * 전부 무료로 돌렸다(docs/STICKER_PACK_OVERLAP_2026-09-14.md). 움직이는 이모티콘은 키보드에
 * 없으므로 그 문제가 없다. 판정은 {@code Feature.PREMIUM_STICKER} 를 확장 무드팩과 함께 쓴다 —
 * 사용자에게는 "표현이 늘어난다"는 하나의 혜택이고, 게이트를 쪼개면 결제 화면만 길어진다.
 *
 * <p><b>무료 6종은 맛보기다.</b> 전부 잠그면 이 기능이 있다는 것 자체를 모르는 채로
 * 결제 화면을 보게 된다.
 *
 * <p>프론트 {@code frontend/src/constants/animatedStickers.ts} 와 code·premium 이
 * 정확히 짝을 맞춰야 한다 — 두 파일 모두 같은 원본에서 생성했다. 여기서 추가하면
 * 거기도 같이 추가할 것.
 *
 * <p><b>packId 는 상품 단위다</b>(2026-09-21). premium 이 "PRO 인가"만 답할 수 있는 것과
 * 달리, 낱개 구매는 "무엇을 샀나"를 답해야 해서 판매 단위가 필요하다. PRO 24종을 주제별
 * 5팩으로 나눴고 — <b>누가 무엇을 쓸 수 있는지는 하나도 바뀌지 않는다</b>. 무료 6종은
 * 그대로 무료 팩이고, PRO 는 전과 같이 24종 전부가 열린다. 달라진 건 무료 사용자가
 * "전부 아니면 전무" 대신 한 팩만 살 수 있다는 것뿐이다({@link StickerPacks}).
 */
public enum AnimatedSticker {

    ANIM_TWO_HEARTS("두근두근", false, StickerPacks.ANIM_BASIC),
    ANIM_KISS("뽀뽀", false, StickerPacks.ANIM_BASIC),
    ANIM_LOVE_FACE("사랑스러워", false, StickerPacks.ANIM_BASIC),
    ANIM_JOY("빵터짐", false, StickerPacks.ANIM_BASIC),
    ANIM_THUMBS_UP("좋아", false, StickerPacks.ANIM_BASIC),
    ANIM_PLEADING("제발", false, StickerPacks.ANIM_BASIC),

    ANIM_HEART("하트", true, StickerPacks.ANIM_LOVE),
    ANIM_SPARKLING_HEART("반짝하트", true, StickerPacks.ANIM_LOVE),
    ANIM_HEART_EYES("반함", true, StickerPacks.ANIM_LOVE),
    ANIM_STAR_STRUCK("감탄", true, StickerPacks.ANIM_LOVE),
    ANIM_HUG("안아줘", true, StickerPacks.ANIM_LOVE),

    ANIM_SOB("엉엉", true, StickerPacks.ANIM_UPSET),
    ANIM_HOLDING_TEARS("울컥", true, StickerPacks.ANIM_UPSET),
    ANIM_RAGE("화남", true, StickerPacks.ANIM_UPSET),
    ANIM_HUFF("씩씩", true, StickerPacks.ANIM_UPSET),

    ANIM_SLEEPING("잘게", true, StickerPacks.ANIM_CHILL),
    ANIM_ZANY("장난", true, StickerPacks.ANIM_CHILL),
    ANIM_COOL("여유", true, StickerPacks.ANIM_CHILL),
    ANIM_YAWN("졸려", true, StickerPacks.ANIM_CHILL),
    ANIM_SMILE("흐뭇", true, StickerPacks.ANIM_CHILL),

    ANIM_PARTY_FACE("신남", true, StickerPacks.ANIM_CELEBRATE),
    ANIM_PARTY_POPPER("축하", true, StickerPacks.ANIM_CELEBRATE),
    ANIM_BIRTHDAY_CAKE("생일", true, StickerPacks.ANIM_CELEBRATE),
    ANIM_GIFT("선물", true, StickerPacks.ANIM_CELEBRATE),
    ANIM_ROSE("장미", true, StickerPacks.ANIM_CELEBRATE),
    ANIM_BOUQUET("꽃다발", true, StickerPacks.ANIM_CELEBRATE),

    ANIM_FIRE("불타오르네", true, StickerPacks.ANIM_CHEER),
    ANIM_MUSCLE("힘내", true, StickerPacks.ANIM_CHEER),
    ANIM_PRAY("부탁해", true, StickerPacks.ANIM_CHEER),
    ANIM_EYES("봐봐", true, StickerPacks.ANIM_CHEER);

    private final String label;
    private final boolean premium;
    private final String packId;

    AnimatedSticker(String label, boolean premium, String packId) {
        this.label = label;
        this.premium = premium;
        this.packId = packId;
    }

    public String label() {
        return label;
    }

    public boolean isPremium() {
        return premium;
    }

    /** 이 이모티콘이 속한 판매 단위 — {@code sticker_packs.id}. */
    public String packId() {
        return packId;
    }

    public static Optional<AnimatedSticker> from(String code) {
        return Arrays.stream(values()).filter(s -> s.name().equals(code)).findFirst();
    }

    /** 이 content 가 PRO 전용 움직이는 이모티콘인가. 코드가 아니면 false. */
    public static boolean isPremiumContent(String content) {
        return from(content).map(AnimatedSticker::isPremium).orElse(false);
    }
}
