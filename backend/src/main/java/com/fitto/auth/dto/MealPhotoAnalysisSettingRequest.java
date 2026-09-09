package com.fitto.auth.dto;

import jakarta.validation.constraints.NotNull;

/** 음식 사진 자동 분석 설정 — 켜면 사진을 붙여 저장하는 것만으로 칼로리가 채워진다. */
public record MealPhotoAnalysisSettingRequest(
        @NotNull(message = "설정 값은 필수입니다.")
        Boolean enabled
) {
}
