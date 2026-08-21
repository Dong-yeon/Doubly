package com.fitto.voice.dto;

import com.fitto.voice.domain.WorkoutBooster;

import java.time.LocalDateTime;

/**
 * 운동 부스터 — 대기 중인 것 하나.
 *
 * <p>세션 시작 화면이 이걸 받아 재생하고 {@code POST .../played} 로 소비를 확정한다.
 * 대기 중인 게 없으면 응답 자체가 {@code null} 이다(빈 껍데기를 내려주면 화면이
 * "부스터가 왔다"와 "안 왔다"를 구분하려고 필드를 뒤져야 한다).
 */
public record WorkoutBoosterResponse(
        Long id,
        String senderName,
        String audioUrl,
        String message,
        LocalDateTime createdAt
) {
    public static WorkoutBoosterResponse of(WorkoutBooster b, String senderName) {
        return new WorkoutBoosterResponse(b.getId(), senderName, b.getAudioUrl(),
                b.getMessage(), b.getCreatedAt());
    }
}
