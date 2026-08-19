package com.fitto.diet.dto;

import com.fitto.diet.domain.MealType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * 식단 기록 저장/수정 요청 — POST /meal, PUT /meal/{id}.
 *
 * <p>{@code items} 가 있으면 그게 기준이다 — 칼로리·매크로는 서버가 항목 합으로 계산하므로
 * 같이 보낸 calories/carbs/protein/fat 은 무시된다. 항목 없이 합계만 보내는 기존 방식도
 * 그대로 동작한다(사진만 찍고 총 칼로리만 적는 경우).
 */
public record SaveMealRequest(
        @NotNull(message = "식단 날짜는 필수입니다.")
        LocalDate mealDate,

        @NotNull(message = "끼니 종류는 필수입니다.")
        MealType mealType,

        String memo,

        String photoUrl,

        Integer calories,

        Integer carbs,

        Integer protein,

        Integer fat,

        @Min(0) Integer sugar,

        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        @Min(0) Integer sodium,

        @Min(0) Integer fiber,

        @Valid
        @Size(max = 30, message = "한 끼니에 담을 수 있는 음식은 30개까지예요.")
        List<MealItemRequest> items,

        /**
         * "데이트" 칩 — true 면 커플 상대방에게도 같은 끼니가 칼로리 절반으로 자동 등록된다.
         * 커플이 연결돼 있지 않으면 조용히 무시된다(혼자 저장). 기본값 false.
         */
        Boolean sharedWithPartner
) {
    /** 데이트 플래그 이전부터 쓰던 12개짜리 호출부(기존 테스트 등) 호환용 — 기본값 false. */
    public SaveMealRequest(LocalDate mealDate, MealType mealType, String memo, String photoUrl,
                           Integer calories, Integer carbs, Integer protein, Integer fat,
                           Integer sugar, Integer sodium, Integer fiber, List<MealItemRequest> items) {
        this(mealDate, mealType, memo, photoUrl, calories, carbs, protein, fat,
                sugar, sodium, fiber, items, false);
    }

    /** null 을 매번 방어하지 않도록 — 항목 미전송은 빈 목록과 같게 다룬다. */
    public List<MealItemRequest> itemsOrEmpty() {
        return items != null ? items : List.of();
    }

    public boolean sharedWithPartnerOrDefault() {
        return Boolean.TRUE.equals(sharedWithPartner);
    }
}
