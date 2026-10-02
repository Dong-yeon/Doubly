package com.fitto.journal.domain;

/**
 * 기록을 어디서 남겼나 — 입구별 비율을 재기 위한 계측 값(분석 §5-3). 저장하지 않는다.
 *
 * <p>이벤트 detail 에는 <b>이 enum 이름만</b> 실린다. 앱이 보내는 자유 문자열을 그대로 싣지 않으려고
 * 서버가 enum 으로 받는다.
 */
public enum JournalSource {
    /** 홈 무드를 고른 직후 "한 줄 남기기" */
    MOOD_PICKER,
    /** MY → 나의 하루 */
    JOURNAL_LIST,
    /** 미연결 홈 "혼자서도 시작할 수 있어요" */
    UNCONNECTED_HOME
}
