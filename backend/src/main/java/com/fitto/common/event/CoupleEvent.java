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
    /** 우리 이모지 세트 생성 완료/삭제 — 수신측은 GET /api/v1/couple-emojis 로 트레이를 다시 조회한다 */
    public static final String COUPLE_EMOJI = "COUPLE_EMOJI";
    /** 커플 게임 판 변경(새 판·칸 입력·완성·포기) — 수신측은 GET /api/v1/games/sudoku/current 로 다시 조회한다 */
    public static final String GAME = "GAME";
    /** 럽슐랭 장소가 새로 생겼다(채팅 링크 칩·장소 추가 등) — 수신측은 럽슐랭 목록 캐시를 비우고 GET /api/v1/places 로 다시 받는다 */
    public static final String PLACE = "PLACE";
    /** 결제로 광고 제거·플랜이 바뀌었다(구독 결제·영구권 구매·환불) — 수신측은 GET /api/v1/plan/me 를 다시 받는다(상대가 사면 나도 광고가 꺼진다) */
    public static final String PLAN = "PLAN";
}
