package com.fitto.place.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 장소 상세 메뉴 — GET /places/{id}/menu. 두 갈래를 한 번에 싣는다.
 * <ul>
 *   <li>{@code items}·{@code signature}: "여기서 먹은 것" — 이 장소 방문에 연결된 식단의 음식 이름을 센다(P1).</li>
 *   <li>{@code board}·{@code boardPhotos}: "우리가 쌓는 메뉴"(V131) — 메뉴판을 찍어 읽은 이름·가격과 그 사진.</li>
 * </ul>
 *
 * <p><b>칼로리는 싣지 않는다</b> — 커플 둘이 같이 보는 화면이라 상대가 먹은 양이 보이면 감시로 읽힌다(2026-10-02 결정,
 * docs/LOVEBODY_WRAPUP_2026-10-03.md §2). 이름·횟수·마지막으로 먹은 날만.
 *
 * @param items       많이 먹은 순(같으면 최근 순) 상위 {@code MAX_ITEMS}개
 * @param signature   대표 메뉴 제안 — 2번 이상 먹은 것 중 상위 3개. 저장하지 않는다(제안만)
 * @param board       메뉴판 메뉴 — 저장한 순서대로. 옛 앱은 이 칸을 모른다(무시한다)
 * @param boardPhotos 메뉴판 사진 — 최근 것 먼저
 */
public record PlaceMenuResponse(List<MenuItem> items, List<String> signature,
                                List<BoardItem> board, List<BoardPhoto> boardPhotos) {

    public record MenuItem(String name, long times, LocalDate lastDate) {
    }

    /** @param price 원 단위, 모르면 null */
    public record BoardItem(Long id, String name, Integer price) {
    }

    public record BoardPhoto(Long id, String imageUrl, Long uploadedBy, LocalDateTime createdAt) {
    }

    /** "여기서 먹은 것"만 — 메뉴판 칸은 비운다 */
    public PlaceMenuResponse(List<MenuItem> items, List<String> signature) {
        this(items, signature, List.of(), List.of());
    }

    public PlaceMenuResponse withBoard(List<BoardItem> board, List<BoardPhoto> boardPhotos) {
        return new PlaceMenuResponse(items, signature, board, boardPhotos);
    }

    public static PlaceMenuResponse empty() {
        return new PlaceMenuResponse(List.of(), List.of());
    }
}
