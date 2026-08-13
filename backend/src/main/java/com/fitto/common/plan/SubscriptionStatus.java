package com.fitto.common.plan;

/** 구독 상태 — 스토어 웹훅이 갱신한다. */
public enum SubscriptionStatus {

    /** 유효. 단 {@code expires_at} 이 지났으면 만료로 본다(웹훅 지연 대비). */
    ACTIVE,
    /** 기간 종료 또는 해지 */
    EXPIRED,
    /** 환불·취소 — 즉시 무효 */
    REFUNDED
}
