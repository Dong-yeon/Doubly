package com.fitto.diet.domain;

/**
 * 간헐적 단식 방식 — 이름이 붙은 프리셋은 기본 목표 시간을 갖고, CUSTOM 은 사용자가 직접 정한다.
 * (targetHours 는 세션에 항상 명시적으로 저장되므로 CUSTOM 도 동일한 계산 로직을 탄다.)
 */
public enum FastingPlan {
    SIXTEEN_EIGHT(16, "16:8"),
    EIGHTEEN_SIX(18, "18:6"),
    TWENTY_FOUR(20, "20:4"),
    OMAD(23, "OMAD"),
    CUSTOM(0, "커스텀");

    private final int defaultHours;
    private final String label;

    FastingPlan(int defaultHours, String label) {
        this.defaultHours = defaultHours;
        this.label = label;
    }

    public int defaultHours() {
        return defaultHours;
    }

    public String label() {
        return label;
    }
}
