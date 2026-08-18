package com.fitto.voice.domain;

/**
 * 음성 응원 문구 — 운동 중 정해진 순간에 재생되는 고정 3종.
 * 자유 문구가 아니라 이 3개로 고정한 이유는, 사용자가 매번 새 문구를 녹음하게 하면
 * "언제 재생될지" 자체를 설계해야 해서 복잡해진다. 대신 앱이 이미 아는 순간
 * (휴식 타이머 종료·PR 달성·운동 완료)에 맞춰 문구를 미리 정해두고, 그 문구에 맞는
 * 목소리만 녹음받는다.
 */
public enum VoicePhrase {
    REST_END("휴식 끝났을 때"),
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
