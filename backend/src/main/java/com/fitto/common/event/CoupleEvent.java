package com.fitto.common.event;

/**
 * 커플 실시간 이벤트 — /sub/couple/{relationId} 로 발행.
 * 민감 데이터는 싣지 않고 타입만 보내, 수신측이 인증된 REST 로 다시 조회한다.
 */
public record CoupleEvent(String type) {
    public static final String BACKGROUND = "BACKGROUND";
    public static final String ANNIVERSARY = "ANNIVERSARY";
    public static final String WORKOUT = "WORKOUT";
    public static final String DIET = "DIET";
    public static final String DIET_GOAL = "DIET_GOAL";
    public static final String FASTING = "FASTING";
    public static final String FEED = "FEED";
    public static final String TRIP = "TRIP";
    public static final String CHALLENGE = "CHALLENGE";
    public static final String QUESTION = "QUESTION";
    public static final String CALENDAR = "CALENDAR";
    /** 가상 터치 전송 — 수신측은 GET /api/v1/chat/{relationId}/touch/latest 로 다시 조회한다 */
    public static final String TOUCH = "TOUCH";
    /** 무드 상태 변경 — 수신측은 GET /api/v1/mood 로 다시 조회한다 */
    public static final String MOOD = "MOOD";
}
