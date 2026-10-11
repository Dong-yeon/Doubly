package com.fitto.place.dto;

import java.util.List;
import java.util.Map;

/**
 * 이번 달 외식 — GET /places/eat-out/stats?month=YYYY-MM (LOVEBODY_LOVELICHELIN_LINK P2-3).
 * 커플 단위(둘의 기록을 합친다). 칼로리는 싣지 않는다 — 상대가 먹은 양 비노출 결정과 같은 선.
 *
 * @param month          대상 달(KST) "YYYY-MM"
 * @param outings        외식 횟수 = 식단이 붙은 방문 수(같이 먹기는 방문이 하나라 한 번)
 * @param sharedOutings  그중 같이 먹은 것
 * @param visits         다녀온 곳 전체(식단 없는 방문 포함 — 카페·전시 등)
 * @param newPlaces      이번 달 처음 가 본 곳 수(그 장소의 첫 방문이 이 달)
 * @param topPlaces      많이 간 곳 상위 3(방문 수 기준)
 * @param byMealType     외식의 끼니별 횟수(BREAKFAST/LUNCH/DINNER/SNACK, 0 은 뺀다)
 * @param previousOutings 지난달 외식 횟수 — "지난달보다 N번 더"
 */
public record EatOutStatsResponse(
        String month,
        int outings,
        int sharedOutings,
        int visits,
        int newPlaces,
        List<TopPlace> topPlaces,
        Map<String, Integer> byMealType,
        int previousOutings
) {
    public record TopPlace(Long placeId, String name, int visits) {
    }
}
