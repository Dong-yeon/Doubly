package com.fitto.voice.domain;

/**
 * 음성 응원 문구 — 운동 중 정해진 순간에 재생되는 고정 세트.
 * 자유 문구가 아니라 정해진 목록으로 고정한 이유는, 사용자가 매번 새 문구를 녹음하게 하면
 * "언제 재생될지" 자체를 설계해야 해서 복잡해진다. 대신 앱이 이미 아는 순간
 * (운동 시작·휴식 종료·마지막 세트·PR·운동 완료)에 맞춰 문구를 미리 정해두고, 그 문구에 맞는
 * 목소리만 녹음받는다.
 *
 * <p>{@code WORKOUT_START}·{@code LAST_SET} 은 2026-08 진단 리포트가 짚은 두 순간이다 —
 * <b>시작</b>이 가장 힘든 지점이고, <b>마지막 세트</b>가 가장 포기하기 쉬운 지점이다.
 * 상설 클립이라 없는 사람은 그냥 재생되지 않는다(기존 3종과 같은 규칙).
 */
public enum VoicePhrase {
    WORKOUT_START("운동 시작할 때"),
    REST_END("휴식 끝났을 때"),
    LAST_SET("마지막 세트일 때"),
    PR("신기록 세웠을 때"),
    WORKOUT_COMPLETE("운동 다 끝났을 때");

    private final String label;

    VoicePhrase(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
