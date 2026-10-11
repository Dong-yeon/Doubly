package com.fitto.place.dto;

import jakarta.validation.constraints.NotBlank;

/** 메뉴판 사진 분석 요청 — POST /places/{id}/menu-board/analyze. 사진은 앱이 먼저 올린 URL */
public record AnalyzeMenuBoardRequest(
        @NotBlank(message = "사진 주소는 필수입니다.")
        String photoUrl
) {
}
