package com.fitto.content.dto;

import com.fitto.content.domain.ContentType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 콘텐츠 등록 요청 — POST /contents. 제목은 GET /contents/search(TMDB) 결과를 그대로
 * 넘기거나 직접 입력한다 — 검색이 안 되는 공연(PERFORMANCE)이나 검색 미설정 환경도
 * 항상 직접 입력으로 등록 가능해야 한다.
 */
public record SaveContentRequest(
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 100, message = "제목은 100자 이내로 입력해주세요.")
        String title,

        @NotNull(message = "종류를 선택해주세요.")
        ContentType type,

        /** TMDB 검색 결과에서 채워짐 — 직접 입력 시 없음(선택) */
        String posterUrl
) {
}
