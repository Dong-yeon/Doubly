package com.fitto.place.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** 장소 등록 요청 — POST /places */
public record SavePlaceRequest(
        @NotBlank(message = "장소 이름은 필수입니다.")
        @Size(max = 100, message = "장소 이름은 100자 이내로 입력해주세요.")
        String name,

        String address,

        BigDecimal lat,

        BigDecimal lng,

        @Size(max = 30, message = "카테고리는 30자 이내로 입력해주세요.")
        String category
) {
}
