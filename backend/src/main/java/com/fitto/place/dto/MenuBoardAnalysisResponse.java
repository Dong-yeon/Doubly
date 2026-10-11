package com.fitto.place.dto;

import java.util.List;

/**
 * 메뉴판 분석 결과 — 저장하지 않는다. 앱이 확인·수정 화면에 펼치고, 사람이 고친 목록을 PUT /places/{id}/menu-board 로 저장한다.
 *
 * @param isMenu 메뉴판으로 보이지 않으면 false(items 는 빈 목록)
 */
public record MenuBoardAnalysisResponse(boolean isMenu, List<Item> items) {

    /** @param price 원 단위, 안 적혀 있거나 "시가"면 null */
    public record Item(String name, Integer price) {
    }

    public static MenuBoardAnalysisResponse notMenu() {
        return new MenuBoardAnalysisResponse(false, List.of());
    }
}
