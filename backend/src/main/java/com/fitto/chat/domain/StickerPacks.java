package com.fitto.chat.domain;

/**
 * 코드 → 판매 단위(팩) 매핑 — {@code sticker_packs.id} 의 단일 출처.
 *
 * <p><b>왜 여기(chat.domain)에 있나</b>: 무엇이 어느 팩에 속하는지는 <b>카탈로그의 성질</b>이지
 * 결제의 성질이 아니다. 그림이 어느 묶음인지는 {@link AnimatedSticker}·{@link StickerImage}·
 * {@link MoodPack}·{@link TouchGesture} 가 이미 아는 사실이고, 가격과 소유는
 * {@code com.fitto.sticker} 가 안다. 매핑을 여기 두면 의존이 한 방향으로만 흐른다
 * (chat → sticker). 반대로 두면 sticker 가 네 enum 을 전부 알아야 한다.
 *
 * <p><b>모르는 코드는 무료다.</b> 이건 관대함이 아니라 2026-09-14 사고의 재발 방지다 —
 * 무료라고 보여 준 것을 서버가 막으면 STOMP 에서는 402 를 화면으로 돌려줄 방법이 없어
 * 말풍선이 "전송 중"에 멈춘다(docs/STICKER_PACK_OVERLAP_2026-09-14.md). 그래서
 * <b>팩에 없으면 통과</b>시킨다. 유니코드 이모지, 우리 이모지, 그리고 피커에서 내린
 * 내린 이미지 스티커(곰돌이·더비·블리)가 전부 이 경로로 지난다 — {@link MoodPack} 이 "목록에 없는
 * 이모지는 무료다"로 이미 쓰고 있던 규칙과 같다.
 */
public final class StickerPacks {

    /*
     * ── 무료 — 움직이는 이모티콘 4팩 ──────────────────────────────────────
     *
     * 2026-09-22 에 8팩에서 4팩으로 합쳤다(V100). 110종을 8칸으로 쪼개니 한 팩이 7~18장이라
     * <b>고르는 것보다 팩을 넘기는 데 손이 더 갔다</b> — 찾는 그림이 어느 칸에 있는지도 기억이
     * 안 된다. 같은 날 격자를 6칸에서 7칸으로 줄이고 패널을 높여 한 번에 28장이 보이게 했으므로,
     * 팩 하나가 30장쯤 되어도 스크롤 한 번이면 끝난다.
     */
    public static final String ANIM_LOVE = "ANIM_LOVE";
    /** 웃음·장난 + 축하 (옛 ANIM_CELEBRATE 흡수) */
    public static final String ANIM_FUN = "ANIM_FUN";
    /** 위로·응원 — 속상할 때와 힘내라는 말은 같은 순간에 오간다 (옛 ANIM_UPSET 흡수) */
    public static final String ANIM_CHEER = "ANIM_CHEER";
    /** 일상 — 동물·먹을 것·날씨. 셋 다 한 자릿수라 따로 둘 이유가 없었다 */
    public static final String ANIM_DAILY = "ANIM_DAILY";
    public static final String MOOD_BASIC = "MOOD_BASIC";
    public static final String TOUCH_BASIC = "TOUCH_BASIC";
    /* 캐릭터 스티커 — 상점에 올라가지만 첫 두 팩은 0원이다(V97) */
    public static final String EGG_BOILED = "EGG_BOILED";
    public static final String EGG_DUO = "EGG_DUO";

    /* ── 유료 (PRO 구독이면 전부 / 낱개로도 산다) ──────────────────────────── */
    public static final String MOOD_PREMIUM = "MOOD_PREMIUM";
    public static final String TOUCH_PREMIUM = "TOUCH_PREMIUM";

    private StickerPacks() {
    }

    /**
     * {@code MessageType.STICKER} 의 content 가 속한 팩 — 팩이 없으면 {@code null}(= 무료).
     *
     * <p>두 카탈로그를 차례로 본다. 둘 다 아니면 유니코드 이모지이거나 우리 이모지 id 이거나
     * 내린 캐릭터의 지난 코드다 — 전부 무료로 통과시킨다(클래스 주석).
     */
    public static String ofStickerContent(String content) {
        if (content == null) {
            return null;
        }
        return AnimatedSticker.from(content)
                .map(AnimatedSticker::packId)
                .or(() -> StickerImage.from(content).map(StickerImage::packId))
                .orElse(null);
    }

    /**
     * 무드 이모지가 속한 팩 — 확장 세트만 팩을 갖는다.
     *
     * <p>기본 12종을 {@code MOOD_BASIC} 으로 답하지 않고 {@code null} 을 주는 이유: 무드는
     * 원래 서버가 목록을 강제하지 않고 길이만 검증한다({@link MoodPack} 주석). 기본 목록을
     * 판정에 끌어들이면 목록에 없는 이모지를 쓰던 기존 동작이 갑자기 막힌다.
     */
    public static String ofMoodEmoji(String emoji) {
        return MoodPack.isPremium(emoji) ? MOOD_PREMIUM : null;
    }

    /** 터치 제스처가 속한 팩 — 무료 3종도 팩이 있다(코드가 닫힌 목록이라 강제해도 안전하다). */
    public static String ofTouchGesture(String code) {
        return TouchGesture.from(code)
                .map(g -> g.isPremium() ? TOUCH_PREMIUM : TOUCH_BASIC)
                .orElse(null);
    }
}
