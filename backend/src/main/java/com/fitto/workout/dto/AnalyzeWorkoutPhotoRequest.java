package com.fitto.workout.dto;

import jakarta.validation.constraints.NotBlank;

/** AI 운동 인증샷 분석 요청 — POST /workout/analyze-photo */
public record AnalyzeWorkoutPhotoRequest(
        @NotBlank(message = "사진 주소는 필수입니다.")
        String photoUrl
) {
}
