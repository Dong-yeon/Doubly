package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 이미지 스티커 — {@link MessageType#STICKER} 메시지 중 유니코드 이모지가 아니라
 * 로컬 번들 이미지로 그려지는 것들. {@code content} 값은 이 enum 의 {@link #name()}
 * 그대로 저장된다({@link TouchGesture} 와 같은 방식).
 *
 * <p>프론트 {@code frontend/src/constants/stickerImages.ts} 와 코드가 정확히 짝을
 * 맞춰야 한다 — 여기서 추가하면 거기도 같이 추가할 것.
 *
 * <p>일반 이모지 스티커(예: "💕")는 이 enum 에 없으므로 {@link #from(String)} 이
 * empty 를 반환하고, 알림 미리보기는 기존처럼 이모지 자체를 보여준다.
 */
public enum StickerImage {
    LOVE_BEAR("사랑해");

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
