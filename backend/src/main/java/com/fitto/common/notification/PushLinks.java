package com.fitto.common.notification;

/**
 * 푸시를 탭했을 때 열 화면 경로.
 *
 * <p>값은 앱의 딥링크 경로({@code frontend/src/navigation/linking.ts} 의 {@code config.screens})
 * 와 <b>같은 문자열</b>이다. 클라이언트가 앞에 {@code doubly://} 를 붙여 그대로 연다.
 * 서버가 스킴을 모르게 두는 이유는, 웹(PWA)처럼 스킴이 다른 환경이 생겨도 서버를
 * 고치지 않기 위해서다.
 *
 * <p><b>여기에 없는 경로를 문자열로 직접 쓰지 말 것.</b> linking.ts 에 없는 경로를 보내면
 * 알림을 탭해도 아무 데도 가지 않는데, 그 사실이 발송 시점에는 드러나지 않는다.
 */
public final class PushLinks {

    /** 홈 — 경로가 빈 문자열이다(linking.ts 의 {@code HomeMain: ''}). */
    public static final String HOME = "";
    public static final String FEED = "feed";
    public static final String QUESTION = "question";
    public static final String GAME_SUDOKU = "game/sudoku";
    public static final String GAME_OMOK = "game/omok";
    public static final String CALENDAR = "calendar";
    public static final String COUPLE_CONNECT = "couple/connect";
    public static final String WORKOUT = "workout";
    public static final String WORKOUT_CHALLENGE = "workout/challenge";
    public static final String WORKOUT_ROUTINES = "workout/routines";
    public static final String WORKOUT_VOICE_CLIPS = "workout/voice-clips";
    public static final String DIET = "diet";
    public static final String PLACE = "place";
    /**
     * 콘텐츠 목록 — 별도 화면이 아니라 럽슐랭 화면의 칩 세그먼트다(linking.ts 의 {@code PlaceMain}).
     * {@code "content"} 로 두면 경로 맵에 없어 알림을 탭해도 아무 데도 가지 않는다.
     */
    public static final String CONTENT = "place";
    public static final String TRIPS = "trips";
    public static final String TRAINER_DASHBOARD = "trainer";

    private PushLinks() {
    }

    /** 채팅방 — 커플 관계 id 가 곧 방 id 다. */
    public static String chat(Long relationId) {
        return relationId == null ? "chat" : "chat/" + relationId;
    }

    /** 맛집 상세. */
    public static String place(Long placeId) {
        return placeId == null ? PLACE : "place/" + placeId;
    }

    /** 여행 상세. */
    public static String trip(Long tripId) {
        return tripId == null ? TRIPS : "trips/" + tripId;
    }

    /**
     * 콘텐츠(영화·공연·드라마) 상세.
     *
     * <p>경로가 {@code place/} 아래인 것은 이 화면이 럽슐랭 탭에 있기 때문이다
     * (linking.ts 의 {@code ContentDetail: 'place/content/:contentId'}). 예전엔
     * {@code "content/" + id} 를 보냈는데 경로 맵에 없는 문자열이라 <b>알림을 탭해도
     * 아무 데도 가지 않았고</b>, 화면 경로와 안 맞으니 상단바에서 지워지지도 않았다
     * (2026-09-14). 이 클래스 주석의 "여기에 없는 경로를 직접 쓰지 말 것"이 바로 이 얘기다.
     */
    public static String content(Long contentId) {
        return contentId == null ? CONTENT : "place/content/" + contentId;
    }
}
