package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * 스티커 팩 — 기본(무료) 세트와 시즌 한정(PRO) 세트.
 *
 * <p><b>왜 PRO 상품으로 쓰나</b>: 콘텐츠 원가가 0이다(유니코드 이모지). 결제 화면의 혜택
 * 목록을 두껍게 만드는 데 서버 비용도 저장 비용도 들지 않는다. 게다가 스티커는 <b>둘 다</b>
 * 쓰게 되므로({@code PREMIUM_STICKER} 는 커플 단위 판정) "내가 결제하면 우리 둘 다 쓴다"는
 * 선물 프레임이 자연스럽게 성립한다.
 *
 * <p><b>content 에 저장되는 값은 이모지 문자 그대로다</b>({@link StickerImage} 처럼 코드가
 * 아니다 — 이 타입을 모르는 화면에서도 이모지로 읽히는 편이 낫다). 그래서 서버는 "보낸
 * 문자열이 프리미엄 팩에 속하는가"로 게이팅한다({@link #isPremium(String)}).
 *
 * <p>프론트 {@code frontend/src/constants/stickerPacks.ts} 와 목록이 정확히 짝을 맞춰야
 * 한다 — 여기서 추가하면 거기도 같이 추가할 것({@link TouchGesture}·{@link StickerImage}
 * 와 같은 방식). 어긋나면 앱에는 보이는데 서버가 막는(또는 그 반대) 스티커가 생긴다.
 */
public enum StickerPack {

    /** 기본 — 감정 표현 위주. 게이팅 없음(스티커 자체를 못 쓰면 채팅이 밋밋해진다). */
    BASIC("기본", false, List.of(
            "💕", "😘", "🥰", "😍",
            "🤗", "😆", "😂", "🥹",
            "😴", "😤", "🥺", "😭",
            "👍", "💪", "🎉", "❤️‍🔥")),

    SPRING("봄", true, List.of("🌸", "🌷", "🌱", "🦋", "🍡", "☔", "🧺", "🌼")),
    SUMMER("여름", true, List.of("🌊", "🍉", "🏖️", "🍦", "🕶️", "🎆", "🧊", "🌴")),
    AUTUMN("가을", true, List.of("🍁", "🍂", "🌰", "🎃", "☕", "🧣", "🌕", "📚")),
    WINTER("겨울", true, List.of("❄️", "⛄", "🧤", "🎄", "🍫", "🔥", "🧦", "🌟")),
    /** 기념일 — 계절과 무관하게 언제나 쓰이는 축하 세트. */
    CELEBRATION("기념일", true, List.of("🎂", "🎁", "🥂", "💍", "🎊", "💐", "🕯️", "👑"));

    private final String label;
    private final boolean premium;
    private final List<String> stickers;

    StickerPack(String label, boolean premium, List<String> stickers) {
        this.label = label;
        this.premium = premium;
        this.stickers = stickers;
    }

    public String label() {
        return label;
    }

    public boolean isPremium() {
        return premium;
    }

    public List<String> stickers() {
        return stickers;
    }

    /**
     * 이 스티커가 PRO 전용인가.
     *
     * <p>어느 팩에도 없는 문자열(이모지 시트에서 직접 고른 임의 이모지)은 <b>무료</b>다 —
     * 기존에 자유롭게 보내던 이모지를 갑자기 막으면 그건 새 상품이 아니라 기능 회수다.
     */
    public static boolean isPremium(String content) {
        return content != null
                && Arrays.stream(values()).anyMatch(p -> p.premium && p.stickers.contains(content));
    }

    public static Optional<StickerPack> packOf(String content) {
        return Arrays.stream(values()).filter(p -> p.stickers.contains(content)).findFirst();
    }
}
