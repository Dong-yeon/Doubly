package com.fitto.trainer.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** 트레이너 등록/프로필 수정 요청 — 모든 필드 선택, null 은 미변경 */
public record TrainerProfileRequest(
        @Size(max = 100, message = "전문 분야는 100자 이내로 입력해주세요.")
        String specialty,

        String introduction,

        String career,

        @Size(max = 500, message = "자격증 정보는 500자 이내로 입력해주세요.")
        String certificate,

        @Min(value = 1, message = "회원 정원은 1명 이상이어야 합니다.")
        @Max(value = 100, message = "회원 정원은 최대 100명입니다.")
        Integer maxMembers,

        Boolean isAccepting
) {
}
