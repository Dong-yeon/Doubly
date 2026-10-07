package com.fitto.place.dto;

import java.util.List;

/**
 * AI 데이트 코스 추천 — 커플이 저장한 장소(places)로 구성한 순서 있는 코스.
 *
 * <p>stop 은 AI 가 쓴 이름이 아니라 <b>id 로 찾은 우리 기록</b>에서 이름·카테고리를 채운다(2026-10-07). 예전엔 AI 가 돌려준
 * 이름 문자열을 그대로 내보내, 이름이 같은 장소 두 곳을 가를 수 없었고 AI 가 이름을 살짝 바꾸면 어느 장소인지 알 길이 없었다.
 */
public record DateCourseResponse(
        boolean hasData,
        List<Stop> stops,
        String comment
) {
    /**
     * 코스의 한 정거장. name·category·reason 은 옛 앱이 그리는 그대로다(새 필드는 옛 앱이 무시한다).
     *
     * @param kind           PLACE | CONTENT
     * @param id             places.id 또는 contents.id — 앱이 상세 화면으로 간다
     * @param nextDistanceKm 다음 장소까지 직선 거리(km, 소수 한 자리). 서버가 좌표로 계산한다 — AI 에게 맡기지 않는다.
     *                       이 장소나 다음 장소에 좌표가 없거나, 다음이 콘텐츠·마지막이면 null
     * @param posterUrl      콘텐츠 포스터(콘텐츠 stop 만)
     * @param contentType    MOVIE | PERFORMANCE | DRAMA (콘텐츠 stop 만)
     */
    public record Stop(String kind, Long id, String name, String category, String reason,
                       Double nextDistanceKm, String posterUrl, String contentType) {
    }

    public static DateCourseResponse empty() {
        return empty("저장된 장소가 부족해요. 맛집 지도에 가고 싶은 곳을 몇 군데 추가하면 코스를 짜드릴게요!");
    }

    /** 재료가 모자랄 때 — 왜 못 짰는지를 comment 로 말한다(코스 유형마다 모자란 게 다르다) */
    public static DateCourseResponse empty(String reason) {
        return new DateCourseResponse(false, List.of(), reason);
    }
}
