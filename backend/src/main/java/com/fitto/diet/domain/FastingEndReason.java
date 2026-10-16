package com.fitto.diet.domain;

/** 단식이 어떻게 끝났나 — 식사 기록으로 자동 종료된 것만 되돌릴 수 있다. */
public enum FastingEndReason {
    /** 종료 버튼 */
    MANUAL,
    /** 식사 기록 저장으로 자동 종료({@code FastingService.onMealSaved}) */
    MEAL
}
