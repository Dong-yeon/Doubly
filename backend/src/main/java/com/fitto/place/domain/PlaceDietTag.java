package com.fitto.place.domain;

/**
 * 장소의 식단 목적 구분 — 하드코어 운동·식단 커플용 Place Map 필터(PLAN.md Place Map).
 * 평소엔 클린식/고단백 데이트 맛집을, 치팅데이엔 실패 없는 맛집을 따로 찾는 수요를 반영한다.
 */
public enum PlaceDietTag {
    CLEAN("클린식"),
    CHEAT("치팅데이"),
    NEUTRAL("일반");

    private final String label;

    PlaceDietTag(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
