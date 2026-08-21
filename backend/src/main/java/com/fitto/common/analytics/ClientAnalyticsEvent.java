package com.fitto.common.analytics;

/**
 * 프론트가 직접 보낼 수 있는 이벤트 화이트리스트.
 *
 * <p>서버가 이미 아는 지점(PlanGuard·AuthService·RelationService)과 달리, "홈 화면 진입"처럼
 * 프론트에서만 알 수 있는 지점만 여기 추가한다. 자유 문자열을 그대로 받으면 event_type
 * 컬럼에 아무 값이나 쌓일 수 있어, enum 화이트리스트로 제한한다(어긋나면 역직렬화 단계에서
 * 400). 값은 {@link AnalyticsEvent} 의 상수 이름과 반드시 맞춘다.
 */
public enum ClientAnalyticsEvent {
    /** 홈 화면 진입 — README "최소한의 이벤트 로깅(기록 버튼 클릭·홈 진입 등)"의 그 예시. */
    HOME_VIEWED;
}
