package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 움직이는 이모티콘 — {@link MessageType#STICKER} 메시지 중 Lottie 애니메이션으로
 * 그려지는 것들. {@code content} 값은 이 enum 의 {@link #name()} 그대로 저장된다
 * ({@link StickerImage}·{@link TouchGesture} 와 같은 방식).
 *
 * <p><b>전부 무료다</b>(2026-09-21). 예전에는 30종 중 24종이 PRO 였는데, 수익화를 세 갈래로
 * 다시 나누면서 이쪽을 통째로 열었다 —
 * <ul>
 *   <li><b>움직이는 이모티콘</b>: 전부 무료. 신규 유입과 일상 사용의 바닥을 깐다</li>
 *   <li><b>캐릭터 스티커</b>: 스티커 상점에서 낱개 구매({@code com.fitto.sticker})</li>
 *   <li><b>우리 이모지</b>: PRO 구독 전용({@code Feature.AI_COUPLE_EMOJI})</li>
 * </ul>
 * 파는 것이 <b>유니코드에 없는 것</b>(우리 얼굴·자체 캐릭터)으로 모였다. 여기 있는 건
 * 결국 폰 키보드에도 있는 글자라, 움직인다는 것만으로 팔기에는 근거가 얇았다 —
 * 2026-09-14 에 유니코드 이모지 팩을 폐지할 때 썼던 바로 그 논리를 끝까지 적용한 것이다
 * (docs/STICKER_PACK_OVERLAP_2026-09-14.md).
 *
 * <p><b>그래서 premium 필드가 없다.</b> 값으로 두면 언젠가 어긋난다 — 무료라는 사실을
 * 구조로 만든다. 잠금이 필요해지면 그 코드에 유료 {@link StickerPacks} 를 달면 되고,
 * 판정은 팩이 한다.
 *
 * <p>출처는 Google <b>Noto Animated Emoji</b>(CC BY 4.0)이고 정적 썸네일은 Noto Emoji
 * (Apache 2.0)다. <b>저작자 표시가 라이선스 조건 자체</b>라
 * {@code frontend/src/constants/openSourceLicenses.ts} 의 항목을 지우면 안 된다.
 *
 * <p>프론트 {@code frontend/src/constants/animatedStickers.ts} 와 code·label·팩이 정확히
 * 짝을 맞춰야 한다 — 어긋나면 {@code StickerPackSyncTest} 가 잡는다. 두 파일 모두
 * {@code gen_catalog.py} 의 한 원본에서 생성했다.
 */
public enum AnimatedSticker {

    /* ── 사랑 (ANIM_LOVE) 18종 ── */
    ANIM_TWO_HEARTS("두근두근", StickerPacks.ANIM_LOVE),
    ANIM_KISS("뽀뽀", StickerPacks.ANIM_LOVE),
    ANIM_LOVE_FACE("사랑스러워", StickerPacks.ANIM_LOVE),
    ANIM_HEART("하트", StickerPacks.ANIM_LOVE),
    ANIM_SPARKLING_HEART("반짝하트", StickerPacks.ANIM_LOVE),
    ANIM_HEART_EYES("반함", StickerPacks.ANIM_LOVE),
    ANIM_STAR_STRUCK("감탄", StickerPacks.ANIM_LOVE),
    ANIM_HUG("안아줘", StickerPacks.ANIM_LOVE),
    ANIM_FINGER_HEART("핑거하트", StickerPacks.ANIM_LOVE),
    ANIM_HAND_HEART("손하트", StickerPacks.ANIM_LOVE),
    ANIM_CUPID("큐피드", StickerPacks.ANIM_LOVE),
    ANIM_GIFT_HEART("리본하트", StickerPacks.ANIM_LOVE),
    ANIM_GROWING_HEART("점점더", StickerPacks.ANIM_LOVE),
    ANIM_BEATING_HEART("콩닥콩닥", StickerPacks.ANIM_LOVE),
    ANIM_REVOLVING_HEARTS("빙글빙글", StickerPacks.ANIM_LOVE),
    ANIM_LIPS("입술", StickerPacks.ANIM_LOVE),
    ANIM_HEART_CAT("하트냥", StickerPacks.ANIM_LOVE),
    ANIM_LOVE_LETTER("러브레터", StickerPacks.ANIM_LOVE),

    /* ── 웃음·축하 ① 웃음·장난 (ANIM_FUN) 18종 ── */
    ANIM_JOY("빵터짐", StickerPacks.ANIM_FUN),
    ANIM_ZANY("장난", StickerPacks.ANIM_FUN),
    ANIM_COOL("여유", StickerPacks.ANIM_FUN),
    ANIM_SMILE("흐뭇", StickerPacks.ANIM_FUN),
    ANIM_YAWN("졸려", StickerPacks.ANIM_FUN),
    ANIM_SLEEPING("잘게", StickerPacks.ANIM_FUN),
    ANIM_OOPS("앗", StickerPacks.ANIM_FUN),
    ANIM_FLUSHED("얼굴빨개짐", StickerPacks.ANIM_FUN),
    ANIM_RELIEVED("후련", StickerPacks.ANIM_FUN),
    ANIM_DROOL("군침", StickerPacks.ANIM_FUN),
    ANIM_WOOZY("알딸딸", StickerPacks.ANIM_FUN),
    ANIM_SMIRK("씨익", StickerPacks.ANIM_FUN),
    ANIM_UPSIDE_DOWN("어쩔", StickerPacks.ANIM_FUN),
    ANIM_HALO("천사", StickerPacks.ANIM_FUN),
    ANIM_THINKING("흠", StickerPacks.ANIM_FUN),
    ANIM_MELTING("녹는다", StickerPacks.ANIM_FUN),
    ANIM_SALUTE("넵", StickerPacks.ANIM_FUN),
    ANIM_SHUSH("쉿", StickerPacks.ANIM_FUN),

    /* ── 위로·응원 ① 속상해 (ANIM_CHEER) 16종 ── */
    ANIM_SOB("엉엉", StickerPacks.ANIM_CHEER),
    ANIM_HOLDING_TEARS("울컥", StickerPacks.ANIM_CHEER),
    ANIM_RAGE("화남", StickerPacks.ANIM_CHEER),
    ANIM_HUFF("씩씩", StickerPacks.ANIM_CHEER),
    ANIM_CRY("눈물", StickerPacks.ANIM_CHEER),
    ANIM_DISAPPOINTED("실망", StickerPacks.ANIM_CHEER),
    ANIM_PENSIVE("시무룩", StickerPacks.ANIM_CHEER),
    ANIM_WEARY("힘들어", StickerPacks.ANIM_CHEER),
    ANIM_TIRED("지쳤어", StickerPacks.ANIM_CHEER),
    ANIM_ANGRY("화났어", StickerPacks.ANIM_CHEER),
    ANIM_CURSING("폭발", StickerPacks.ANIM_CHEER),
    ANIM_UNAMUSED("별로", StickerPacks.ANIM_CHEER),
    ANIM_EYE_ROLL("하아", StickerPacks.ANIM_CHEER),
    ANIM_BROKEN_HEART("상처", StickerPacks.ANIM_CHEER),
    ANIM_ANXIOUS("불안", StickerPacks.ANIM_CHEER),
    ANIM_SWEAT("진땀", StickerPacks.ANIM_CHEER),

    /* ── 웃음·축하 ② 축하해 (ANIM_FUN) 14종 ── */
    ANIM_PARTY_FACE("신남", StickerPacks.ANIM_FUN),
    ANIM_PARTY_POPPER("축하", StickerPacks.ANIM_FUN),
    ANIM_BIRTHDAY_CAKE("생일", StickerPacks.ANIM_FUN),
    ANIM_GIFT("선물", StickerPacks.ANIM_FUN),
    ANIM_ROSE("장미", StickerPacks.ANIM_FUN),
    ANIM_BOUQUET("꽃다발", StickerPacks.ANIM_FUN),
    ANIM_CONFETTI("꽃가루", StickerPacks.ANIM_FUN),
    ANIM_BALLOON("풍선", StickerPacks.ANIM_FUN),
    ANIM_SPARKLES("반짝", StickerPacks.ANIM_FUN),
    ANIM_CHEERS("짠", StickerPacks.ANIM_FUN),
    ANIM_CHAMPAGNE("축포", StickerPacks.ANIM_FUN),
    ANIM_TROPHY("우승", StickerPacks.ANIM_FUN),
    ANIM_RING("반지", StickerPacks.ANIM_FUN),
    ANIM_CHERRY_BLOSSOM("벚꽃", StickerPacks.ANIM_FUN),

    /* ── 위로·응원 ② 응원해 (ANIM_CHEER) 18종 ── */
    ANIM_THUMBS_UP("좋아", StickerPacks.ANIM_CHEER),
    ANIM_PLEADING("제발", StickerPacks.ANIM_CHEER),
    ANIM_FIRE("불타오르네", StickerPacks.ANIM_CHEER),
    ANIM_MUSCLE("힘내", StickerPacks.ANIM_CHEER),
    ANIM_PRAY("부탁해", StickerPacks.ANIM_CHEER),
    ANIM_EYES("봐봐", StickerPacks.ANIM_CHEER),
    ANIM_CLAP("짝짝짝", StickerPacks.ANIM_CHEER),
    ANIM_RAISED_HANDS("만세", StickerPacks.ANIM_CHEER),
    ANIM_FIST("화이팅", StickerPacks.ANIM_CHEER),
    ANIM_HUNDRED("백점", StickerPacks.ANIM_CHEER),
    ANIM_STAR("별", StickerPacks.ANIM_CHEER),
    ANIM_GLOWING_STAR("반짝별", StickerPacks.ANIM_CHEER),
    ANIM_POINTING("너!", StickerPacks.ANIM_CHEER),
    ANIM_HANDSHAKE("콜", StickerPacks.ANIM_CHEER),
    ANIM_TARGET("명중", StickerPacks.ANIM_CHEER),
    ANIM_ZAP("번쩍", StickerPacks.ANIM_CHEER),
    ANIM_WAVE("안녕", StickerPacks.ANIM_CHEER),
    ANIM_LOVE_SIGN("사랑해", StickerPacks.ANIM_CHEER),

    /* ── 일상 ① 동물 (ANIM_DAILY) 9종 ── */
    ANIM_CAT("고양이", StickerPacks.ANIM_DAILY),
    ANIM_BEAR("곰", StickerPacks.ANIM_DAILY),
    ANIM_PANDA("판다", StickerPacks.ANIM_DAILY),
    ANIM_FOX("여우", StickerPacks.ANIM_DAILY),
    ANIM_LION("사자", StickerPacks.ANIM_DAILY),
    ANIM_FROG("개구리", StickerPacks.ANIM_DAILY),
    ANIM_PENGUIN("펭귄", StickerPacks.ANIM_DAILY),
    ANIM_CHICK("병아리", StickerPacks.ANIM_DAILY),
    ANIM_UNICORN("유니콘", StickerPacks.ANIM_DAILY),

    /* ── 일상 ② 먹을 것 (ANIM_DAILY) 10종 ── */
    ANIM_PIZZA("피자", StickerPacks.ANIM_DAILY),
    ANIM_COFFEE("커피", StickerPacks.ANIM_DAILY),
    ANIM_RAMEN("라면", StickerPacks.ANIM_DAILY),
    ANIM_BURGER("버거", StickerPacks.ANIM_DAILY),
    ANIM_ICE_CREAM("아이스크림", StickerPacks.ANIM_DAILY),
    ANIM_STRAWBERRY("딸기", StickerPacks.ANIM_DAILY),
    ANIM_WATERMELON("수박", StickerPacks.ANIM_DAILY),
    ANIM_AVOCADO("아보카도", StickerPacks.ANIM_DAILY),
    ANIM_EGG("계란", StickerPacks.ANIM_DAILY),
    ANIM_BUBBLE_TEA("버블티", StickerPacks.ANIM_DAILY),

    /* ── 일상 ③ 날씨 (ANIM_DAILY) 7종 ── */
    ANIM_RAIN("비", StickerPacks.ANIM_DAILY),
    ANIM_SNOWMAN("눈사람", StickerPacks.ANIM_DAILY),
    ANIM_RAINBOW("무지개", StickerPacks.ANIM_DAILY),
    ANIM_SNOWFLAKE("눈", StickerPacks.ANIM_DAILY),
    ANIM_OCEAN("파도", StickerPacks.ANIM_DAILY),
    ANIM_MAPLE("단풍", StickerPacks.ANIM_DAILY),
    ANIM_SUN("햇살", StickerPacks.ANIM_DAILY);

    private final String label;
    private final String packId;

    AnimatedSticker(String label, String packId) {
        this.label = label;
        this.packId = packId;
    }

    public String label() {
        return label;
    }

    /** 이 이모티콘이 속한 팩 — {@code sticker_packs.id}. 전부 무료 팩이다. */
    public String packId() {
        return packId;
    }

    public static Optional<AnimatedSticker> from(String code) {
        return Arrays.stream(values()).filter(s -> s.name().equals(code)).findFirst();
    }
}
