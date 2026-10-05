package com.fitto.place.dto;

import com.fitto.diet.dto.MealResponse;

/**
 * 외식 기록 응답.
 *
 * @param replayed 같은 clientRequestId 의 재전송이었다 — 새로 저장하지 않고 처음 결과를 돌려준 것
 * @param place    장소(요약·나/상대 평점·등급 포함). {@code created=true} 면 이번에 새로 담긴 장소
 * @param visit    방문 한 건
 * @param meal     내 몫 식단 — "방문만"이면 null. 같이 먹기의 상대 몫은 싣지 않는다(상대 화면이 자기 목록으로 받는다)
 * @param tierUp   이 기록으로 0 → 등급이 생겼다(등극 축하 모달)
 */
public record MealVisitResponse(
        boolean replayed,
        PlaceResponse place,
        PlaceVisitResponse visit,
        MealResponse meal,
        boolean tierUp
) {
}
