package com.fitto.relation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 가족 이름 변경 요청 — 보호자만 가능. */
public record UpdateFamilyNameRequest(
        @NotBlank(message = "가족 이름을 입력해주세요.")
        @Size(max = 50, message = "가족 이름은 50자 이하로 입력해주세요.")
        String name
) {
}
