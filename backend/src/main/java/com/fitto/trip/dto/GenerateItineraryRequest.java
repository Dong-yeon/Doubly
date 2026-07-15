package com.fitto.trip.dto;

import jakarta.validation.constraints.Size;

/**
 * AI 여행 일정 생성 요청 — 선택 요청사항(예: "맛집 위주로 느긋하게").
 * 본문 없이 호출해도 되며, 그 경우 여행 제목·기간·저장 장소만으로 생성한다.
 */
public record GenerateItineraryRequest(
        @Size(max = 200, message = "요청사항은 200자 이내로 입력해주세요.")
        String preferences
) {
}
