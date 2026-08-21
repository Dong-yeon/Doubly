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
    /** 루틴 선물 전송/응답 — 수신측은 GET /api/v1/workout/routine-gifts/received|sent 로 다시 조회한다 */
    public static final String ROUTINE_GIFT = "ROUTINE_GIFT";
    /** 즐겨찾기 음식 선물 전송/응답 — 수신측은 GET /api/v1/meal/favorite-gifts/received|sent 로 다시 조회한다 */
    public static final String FAVORITE_FOOD_GIFT = "FAVORITE_FOOD_GIFT";
    /** 통화 발신(벨) — 수신측은 GET /api/v1/calls 최신 RINGING 세션을 다시 조회한다 */
    public static final String CALL_INCOMING = "CALL_INCOMING";
    /** 통화 상태 변화(수락/거절/종료) — 양쪽이 GET /api/v1/calls/{id} 로 다시 조회한다 */
    public static final String CALL_UPDATED = "CALL_UPDATED";
}
