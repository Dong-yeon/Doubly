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
 * 더비·블리(DUBI_*·BLI_*)가 전부 이 경로로 지난다 — {@link MoodPack} 이 "목록에 없는
 * 이모지는 무료다"로 이미 쓰고 있던 규칙과 같다.
 */
public final class StickerPacks {

    /* ── 무료 ─────────────────────────────────────────────────────────────── */
    public static final String ANIM_BASIC = "ANIM_BASIC";
    public static final String BEAR = "BEAR";
    public static final String MOOD_BASIC = "MOOD_BASIC";
    public static final String TOUCH_BASIC = "TOUCH_BASIC";

    /* ── 유료 (PRO 구독이면 전부 / 낱개로도 산다) ──────────────────────────── */
    public static final String ANIM_LOVE = "ANIM_LOVE";
    public static final String ANIM_UPSET = "ANIM_UPSET";
    public static final String ANIM_CHILL = "ANIM_CHILL";
    public static final String ANIM_CELEBRATE = "ANIM_CELEBRATE";
    public static final String ANIM_CHEER = "ANIM_CHEER";
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
