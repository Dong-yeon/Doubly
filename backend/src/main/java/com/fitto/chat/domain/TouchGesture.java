package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 가상 터치 제스처 — {@link MessageType#TOUCH} 메시지의 {@code content} 값.
 * PLAN.md "가상 터치 (Touch Gesture — Obimy 벤치마킹)" 참고.
 *
 * <p>무료 3종(손잡기·토닥임·콕찌르기) · PRO 2종(포옹·뽀뽀 — {@code Feature.TOUCH_GESTURE_PREMIUM}
 * 로 게이팅). {@code content} 문자열은 이 enum 의 {@link #name()} 그대로 저장된다.
 */
public enum TouchGesture {
    HAND_HOLD("손잡기", false),
    PAT("토닥임", false),
    POKE("콕 찌르기", false),
    HUG("포옹", true),
    KISS("뽀뽀", true);

    private final String label;
    private final boolean premium;

    TouchGesture(String label, boolean premium) {
        this.label = label;
        this.premium = premium;
    }

    public String label() {
        return label;
    }

    public boolean isPremium() {
        return premium;
    }

    public static Optional<TouchGesture> from(String code) {
        return Arrays.stream(values()).filter(g -> g.name().equals(code)).findFirst();
    }
}
