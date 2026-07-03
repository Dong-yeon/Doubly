package com.fitto.trainer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 루틴 배정 요청 — POST /trainer/routines */
public record AssignRoutineRequest(
        @NotNull(message = "회원을 선택해주세요.")
        Long memberId,

        @NotBlank(message = "루틴 제목은 필수입니다.")
        @Size(max = 100, message = "루틴 제목은 100자 이내로 입력해주세요.")
        String title,

        String description,

        LocalDate routineDate
) {
}
