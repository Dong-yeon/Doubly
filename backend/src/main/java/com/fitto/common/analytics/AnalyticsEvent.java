package com.fitto.common.analytics;

/**
 * 이벤트 타입 상수 — {@link com.fitto.common.event.CoupleEvent} 와 같은 패턴(상수만 모은 홀더).
 *
 * <p><b>FEATURE_USED / FEATURE_BLOCKED 가 핵심이다.</b> {@link com.fitto.common.plan.PlanGuard}
 * 의 {@code require}/{@code consume}/{@code requireCapacity} — 즉 사용자가 직접 누른 동작에서
 * 게이팅을 통과하는 모든 지점 — 이 자동으로 이 두 이벤트를 남긴다({@code detail} 에 어떤
 * {@link com.fitto.common.plan.Feature} 인지 담는다). {@code allows}/{@code state} 는 화면이
 * 자동으로 부르는 조회라 로깅하지 않는다 — 홈·마이 탭을 열 때마다 찍히면 신호가 노이즈에
 * 묻힌다. 이 하나만으로 "실사용 분포(p60~p75) 측정 → FREE 숫자 확정"(README)에 필요한
 * 데이터가 12개 이상의 게이팅 지점 전체에서 별도 계측 없이 모인다.
 *
 * <p>나머지는 PlanGuard 가 닿지 않는 핵심 라이프사이클 지점에 최소로만 붙인다 — "최소한의
 * 이벤트 로깅(기록 버튼 클릭·홈 진입 등)"(README) 그 이상으로 넓히지 않는다.
 */
public final class AnalyticsEvent {

    private AnalyticsEvent() {
    }

    public static final String SIGNUP = "SIGNUP";
    public static final String LOGIN = "LOGIN";
    public static final String COUPLE_CONNECTED = "COUPLE_CONNECTED";
    /** 홈 화면 진입 — 프론트가 AnalyticsController 로 직접 보낸다(서버 자체 발생 지점이 없음). */
    public static final String HOME_VIEWED = "HOME_VIEWED";
    /** PlanGuard 게이팅을 통과 — detail 에 Feature.name(). */
    public static final String FEATURE_USED = "FEATURE_USED";
    /** PlanGuard 게이팅에 막힘(업그레이드 유도) — detail 에 Feature.name(). */
    public static final String FEATURE_BLOCKED = "FEATURE_BLOCKED";
}
