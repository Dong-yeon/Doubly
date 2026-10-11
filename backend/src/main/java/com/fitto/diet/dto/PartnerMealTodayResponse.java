package com.fitto.diet.dto;

import com.fitto.diet.domain.MealType;

import java.util.List;

/**
 * 커플 상대의 오늘 식단 — 홈 커플 카드. 예전엔 운동과 같은 {@code PartnerTodayResponse}(기록 여부 하나)를 썼다.
 *
 * <p>{@link #mealTypes} — 오늘 기록한 <b>끼니 종류만</b>(아침·점심·저녁·간식, 중복 없이 순서대로). 홈 아바타의
 * "오늘 챙김" 링이 조각을 채운다(LOVEBODY_REVIEW §2-2). 식사 내용·칼로리·사진은 싣지 않는다 — 상대 홈에
 * 필요한 건 "챙겼다"는 사실이지 무엇을 얼마나 먹었는지가 아니다. 필드 이름·앞 셋은 예전과 같아 구버전 앱도 읽는다.
 */
public record PartnerMealTodayResponse(boolean connected, String partnerName, boolean completed, List<MealType> mealTypes,
                                       boolean nudgedToday) {

    /** {@link #nudgedToday} 이전 모양 — 식단 찌르기(V120) 전부터 쓰던 호출부 호환용. 찌르기 여부는 컨트롤러가 붙인다. */
    public PartnerMealTodayResponse(boolean connected, String partnerName, boolean completed, List<MealType> mealTypes) {
        this(connected, partnerName, completed, mealTypes, false);
    }

    public static PartnerMealTodayResponse notConnected() {
        return new PartnerMealTodayResponse(false, null, false, List.of());
    }

    /** 오늘 내가 상대에게 "뭐 먹었어?"를 이미 보냈는지 — 럽바디가 버튼 대신 "오늘 물어봤어요"를 보여준다 */
    public PartnerMealTodayResponse withNudgedToday(boolean nudged) {
        return new PartnerMealTodayResponse(connected, partnerName, completed, mealTypes, nudged);
    }
}
