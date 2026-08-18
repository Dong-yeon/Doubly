package com.fitto.mood.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 무드 설정 — emoji 는 12종 프리셋 중 하나(프론트 큐레이션, 서버는 길이만 검증). */
public record MoodRequest(
        @NotBlank(message = "무드를 선택해주세요.")
        @Size(max = 10, message = "이모지 형식이 올바르지 않아요.")
        String emoji,
        @Size(max = 20, message = "메모는 20자 이내로 작성해주세요.")
        String message
) {
}
