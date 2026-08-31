package com.fitto.place.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** 장소 수정 요청 — PUT /places/{id}. 모든 필드 선택, null 은 미변경 */
public record UpdatePlaceRequest(
        @Size(max = 100, message = "장소 이름은 100자 이내로 입력해주세요.")
        String name,

        String address,

        BigDecimal lat,

        BigDecimal lng,

        @Size(max = 30, message = "카테고리는 30자 이내로 입력해주세요.")
        String category
) {
}
