package com.fitto.challenge.dto;

import com.fitto.challenge.domain.ChallengeType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 챌린지 생성 — 종료일 >= 시작일은 서비스에서 검증. */
public record CreateChallengeRequest(
        @NotNull(message = "종류를 선택해주세요.")
        ChallengeType type,
        @NotBlank(message = "제목을 입력해주세요.")
        @Size(max = 100)
        String title,
        @NotNull(message = "시작일을 입력해주세요.")
        LocalDate startDate,
        @NotNull(message = "종료일을 입력해주세요.")
        LocalDate endDate,
        String stake
) {
}
