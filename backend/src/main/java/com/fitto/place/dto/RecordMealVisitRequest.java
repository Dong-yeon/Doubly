package com.fitto.place.dto;

import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * 외식 기록 — POST /places/meal-visits. 장소 확정 + (선택) 식단 + 방문 + (선택) 평점을 한 번에.
 *
 * <p>설계: docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md §4 P0-1. 예전엔 앱이 식단 저장 → 방문 저장 → 평점 저장을
 * 세 번 엮어 반쪽 기록이 남았다.
 *
 * @param clientRequestId 재전송 멱등키 — 앱이 기록 화면을 열 때 한 번 만든다
 * @param placeId         이미 있는 우리 장소. {@code place} 와 둘 중 하나만
 * @param place           검색 결과 그대로(저장 시점에 만든다 — 이미 있으면 그 장소)
 * @param visitedAt       다녀온 날(=먹은 날). 생략하면 KST 오늘, 미래면 400
 * @param photoUrl        사진 하나 — 식단 사진과 방문 사진에 같은 값을 쓴다(한 번만 올린다)
 * @param memo            방문 메모. 식단 메모에는 섞지 않는다
 * @param rating          방문 별점. 내 대표 평점이 아직 없을 때만 대표 평점도 된다(결정 Q3)
 * @param revisitIntent   재방문 의사 — 고르지 않으면 null(예전처럼 true 를 박지 않는다)
 * @param meal            먹은 것 — null 이면 "방문만"(결정 Q1)
 */
public record RecordMealVisitRequest(
        @NotBlank(message = "요청 ID 가 필요합니다.")
        @Size(max = 64, message = "요청 ID 가 너무 깁니다.")
        String clientRequestId,

        Long placeId,

        @Valid
        SavePlaceRequest place,

        LocalDate visitedAt,

        @Size(max = 500)
        String photoUrl,

        String memo,

        @Min(value = 1, message = "별점은 1~5 사이여야 합니다.")
        @Max(value = 5, message = "별점은 1~5 사이여야 합니다.")
        Integer rating,

        Boolean revisitIntent,

        @Valid
        MealPart meal
) {
    /** 식단 몫 — 날짜·사진·멱등키는 바깥 값을 쓴다(SaveMealRequest 의 나머지와 같은 뜻) */
    public record MealPart(
            @NotNull(message = "끼니 종류는 필수입니다.")
            MealType mealType,
            Integer calories,
            Integer carbs,
            Integer protein,
            Integer fat,
            @Min(0) Integer sugar,
            @Min(0) Integer sodium,
            @Min(0) Integer fiber,
            @Valid
            @Size(max = 30, message = "한 끼니에 담을 수 있는 음식은 30개까지예요.")
            List<MealItemRequest> items,
            /** 같이 먹기 — 상대 몫이 반반으로 함께 생긴다. 방문은 내 몫에만 붙는다(결정 Q7) */
            Boolean sharedWithPartner
    ) {
    }
}
