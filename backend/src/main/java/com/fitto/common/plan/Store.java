package com.fitto.common.plan;

/** 구독을 판매한 곳. */
public enum Store {

    GOOGLE_PLAY,
    APP_STORE,
    /**
     * 운영자 수동 부여 — 무료 체험 참여자에게 주는 "얼리 커플" 혜택, CS 보상 등.
     * 이 경우 {@code expires_at} 이 NULL 이면 만료가 없다.
     */
    MANUAL
}
