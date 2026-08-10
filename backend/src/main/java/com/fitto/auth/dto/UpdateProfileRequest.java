package com.fitto.auth.dto;

import com.fitto.user.domain.Gender;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * 프로필 수정 요청 — 이름/사진/신체 정보(제공된 값만 반영).
 * 생년월일·성별·키는 에너지 밸런스(기초대사량) 계산에 쓰인다.
 */
public record UpdateProfileRequest(
        @Size(max = 50)
        String name,

        @Size(max = 500)
        String profileImageUrl,

        @PastOrPresent(message = "생년월일은 오늘 이전이어야 합니다.")
        LocalDate birthDate,

        Gender gender,

        @Min(value = 100, message = "키는 100cm 이상이어야 합니다.")
        @Max(value = 250, message = "키는 250cm 이하여야 합니다.")
        Integer heightCm
) {
}
