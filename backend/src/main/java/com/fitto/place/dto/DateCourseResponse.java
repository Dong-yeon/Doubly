package com.fitto.place.dto;

import java.util.List;

/**
 * AI 데이트 코스 추천 — 커플이 저장한 장소(places)로 구성한 순서 있는 코스.
 */
public record DateCourseResponse(
        boolean hasData,
        List<Stop> stops,
        String comment
) {
    /** 코스의 한 정거장 — 어떤 장소를 왜 이 순서에 넣었는지 */
    public record Stop(String name, String category, String reason) {
    }

    public static DateCourseResponse empty() {
        return new DateCourseResponse(false, List.of(),
                "저장된 장소가 부족해요. 맛집 지도에 가고 싶은 곳을 몇 군데 추가하면 코스를 짜드릴게요!");
    }
}
