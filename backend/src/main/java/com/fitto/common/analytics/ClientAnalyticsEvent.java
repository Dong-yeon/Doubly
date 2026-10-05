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
    HOME_VIEWED,
    /** 결제 퍼널 — 페이월 노출·결제창 열림·취소·실패. 서버는 이 지점을 모른다(스토어 이벤트). */
    PAYWALL_VIEWED,
    PURCHASE_STARTED,
    PURCHASE_CANCELLED,
    PURCHASE_FAILED,
    /**
     * 입력 중 스티커 추천(2026-09-28) — 막대가 떴다 / 막대에서 골랐다. detail 에 걸린 키워드와 코드.
     * 사용자가 친 글 원문은 넣지 않는다(앱이 표에 있는 키워드만 싣는다).
     */
    STICKER_SUGGEST_SHOWN,
    STICKER_SUGGEST_PICKED,
    /** 홈 무드 시트의 "한 줄 남기기" 2단계 노출(2026-10-02). detail 없음 — 앱이 아무것도 싣지 않는다. */
    JOURNAL_PROMPT_SHOWN,
    /*
     * 식단 기록 화면(2026-10-05) — 화면 정리 <b>전</b>의 기준선을 모으려고 붙였다(docs/lovebody-record-screen-plan_2026-10-05.md §9).
     * detail 에는 종류·초·개수만 싣는다. 음식 이름·메모·사진 주소 같은 내용은 넣지 않는다.
     */
    /** 기록 화면 열림 — detail: 들어온 곳(main·edit·calendar·home·chat) */
    MEAL_RECORD_OPENED,
    /** 입력 수단을 썼다 — detail: photo_camera·photo_gallery·favorite·recent·barcode·label·manual */
    MEAL_INPUT_ADDED,
    /** AI 분석을 눌렀다 — detail: photo·text·label. 저장 뒤 서버 자동 분석은 MEAL_RECORD_SAVED 의 a=1 로 */
    MEAL_ANALYZE_STARTED,
    /** 음식 편집을 펼쳤다 — detail: macros(지금 화면의 탄단지 펼침), 정리 뒤엔 row */
    MEAL_ITEM_EDIT_OPENED,
    /** 먹은 양 배수 칩 — detail: 0.5·1·1.5·2 */
    MEAL_MULTIPLIER_CHANGED,
    /** 저장 성공 — detail: new|edit|sheet;t=열린 뒤 초;i=항목 수;p=사진;d=같이 먹기;a=자동 분석 예정 */
    MEAL_RECORD_SAVED,
    /** 저장하지 않고 나감 — detail: new|edit;t=초;i=적어 둔 항목 수;p=사진 */
    MEAL_RECORD_ABANDONED,
    CHAT_SOCKET_SLOW;
}
