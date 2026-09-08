package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 이미지 스티커 — {@link MessageType#STICKER} 메시지 중 유니코드 이모지가 아니라
 * 로컬 번들 이미지로 그려지는 것들. {@code content} 값은 이 enum 의 {@link #name()}
 * 그대로 저장된다({@link TouchGesture} 와 같은 방식).
 *
 * <p>프론트 {@code frontend/src/constants/stickerImages.ts} 와 코드가 정확히 짝을
 * 맞춰야 한다 — 여기서 추가하면 거기도 같이 추가할 것. 어긋나면
 * {@code StickerImageSyncTest} 가 잡는다.
 *
 * <p>일반 이모지 스티커(예: "💕")는 이 enum 에 없으므로 {@link #from(String)} 이
 * empty 를 반환하고, 알림 미리보기는 기존처럼 이모지 자체를 보여준다.
 *
 * <p><b>여기엔 premium 필드가 없다.</b> 이미지 스티커는 번들 에셋이라 원가가 0이고
 * 전부 무료다 — 비개구리 세트(BIGAE_*)도 같은 이유로 무료다
 * (docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §17). PRO 로 돌릴 장이 생기면
 * {@link StickerPack}·{@link AnimatedSticker} 처럼 premium 을 만들고
 * {@code ChatService.send} 의 판정 조건에도 이 enum 을 넣어야 한다 — 현재 그 조건은
 * 두 enum 만 보므로, 필드만 추가하면 서버가 막지 않는다.
 */
public enum StickerImage {
    LOVE_BEAR("사랑해"),

    // 비개구리 10종 — 사용자 손그림 스케치를 스티커화한 자체 캐릭터(설계 메모 §15·§17)
    BIGAE_LOVE("좋아좋아"),
    BIGAE_EXCITED("신났어"),
    BIGAE_LAUGH("하하하"),
    BIGAE_WIGGLE("씰룩씰룩"),
    BIGAE_SULKY("시무룩"),
    BIGAE_ANGRY("화났어"),
    BIGAE_DASH("흥, 간다"),
    BIGAE_CRYING("엉엉"),
    BIGAE_GLOOMY("축 처짐"),
    BIGAE_SLEEPY("잘자");

    private final String label;

    StickerImage(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static Optional<StickerImage> from(String code) {
        return Arrays.stream(values()).filter(s -> s.name().equals(code)).findFirst();
    }
}
