package com.fitto.place.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 장소 상세 "여기서 먹은 것" — GET /places/{id}/menu. 이 장소 방문에 연결된 식단의 음식 이름을 센다.
 *
 * <p><b>칼로리는 싣지 않는다</b> — 커플 둘이 같이 보는 화면이라 상대가 먹은 양이 보이면 감시로 읽힌다(2026-10-02 결정,
 * docs/LOVEBODY_WRAPUP_2026-10-03.md §2). 이름·횟수·마지막으로 먹은 날만.
 *
 * @param items     많이 먹은 순(같으면 최근 순) 상위 {@code MAX_ITEMS}개
 * @param signature 대표 메뉴 제안 — 2번 이상 먹은 것 중 상위 3개. 저장하지 않는다(제안만)
 */
public record PlaceMenuResponse(List<MenuItem> items, List<String> signature) {

    public record MenuItem(String name, long times, LocalDate lastDate) {
    }

    public static PlaceMenuResponse empty() {
        return new PlaceMenuResponse(List.of(), List.of());
    }
}
