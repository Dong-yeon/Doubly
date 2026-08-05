package com.fitto.relation.dto;

import jakarta.validation.constraints.Size;

/** 가족 생성 요청 — 이름을 비우면 "우리 가족"으로 만든다. */
public record CreateFamilyRequest(
        @Size(max = 50, message = "가족 이름은 50자 이하로 입력해주세요.")
        String name
) {
}
