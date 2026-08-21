package com.fitto.call.domain;

/**
 * 통화 생명주기 — 운동 v2 계획의 IN_PROGRESS/COMPLETED 상태 패턴과 같은 사고방식.
 *
 * <pre>
 * RINGING ──accept──▶ ONGOING ──end──▶ ENDED
 *    │
 *    ├──decline(수신자)──▶ DECLINED
 *    └──end(발신자)/24h──▶ MISSED
 * </pre>
 */
public enum CallStatus {
    RINGING,
    ONGOING,
    ENDED,
    MISSED,
    DECLINED;

    /** 더 이상 상태가 바뀌지 않는 종료 상태인가. */
    public boolean isTerminal() {
        return this == ENDED || this == MISSED || this == DECLINED;
    }
}
