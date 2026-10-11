package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;

/** AI 음식 사진 분석 요청 — POST /meal/analyze */
public record AnalyzeMealRequest(
        @NotBlank(message = "사진 주소는 필수입니다.")
        String photoUrl,

        /**
         * 식단 기록 화면에서 고른 럽슐랭 장소(선택). 있으면 가게 이름·이 가게에서 예전에 기록한
         * 메뉴를 프롬프트에 참고 정보로 붙인다({@code MealPlaceHintLoader}). 내 관계의 장소가
         * 아니면 조용히 무시한다 — 힌트는 덤이라 요청을 실패시키지 않는다.
         */
        Long placeId
) {
}
