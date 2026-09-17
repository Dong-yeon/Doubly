package com.fitto.common.plan;

/**
 * 플랜 비교 화면에서 기능을 묶는 단위.
 *
 * <p>{@link Feature} 는 40개다. 한 줄로 늘어놓으면 아무것도 전달되지 않아서, 화면이 접었다
 * 펼 수 있게 묶어 준다. 구분선은 {@code Feature.java} 의 주석 섹션을 그대로 옮긴 것이다 —
 * 그 섹션은 "왜 이 한도인가"의 근거가 같은 것끼리 모아 둔 것이라, 사용자에게 설명하는
 * 단위로도 그대로 쓸 수 있다.
 *
 * <p>순서가 화면 순서다. 커플 앱에서 가장 설명이 쉬운 것(AI·기록 깊이)을 앞에 둔다.
 */
public enum FeatureGroup {

    AI("AI 기능"),
    DEPTH("기록을 깊게"),
    STORAGE("담아두기"),
    ENGAGEMENT("주고받기"),
    DECORATION("꾸미기");

    private final String displayName;

    FeatureGroup(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
