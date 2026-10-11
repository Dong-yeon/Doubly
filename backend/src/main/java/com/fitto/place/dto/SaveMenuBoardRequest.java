package com.fitto.place.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 메뉴 저장 — PUT /places/{id}/menu-board. 목록을 <b>통째로 바꾼다</b>(빈 목록이면 메뉴를 비운다).
 * 같은 요청을 다시 보내도 결과가 같다 — 응답을 못 받고 다시 눌러도 메뉴가 두 벌이 되지 않는다.
 *
 * @param photoUrl 이번에 찍은 메뉴판 사진(선택). 이미 붙은 사진이면 다시 붙이지 않는다
 */
public record SaveMenuBoardRequest(
        @NotNull(message = "메뉴 목록이 필요합니다.")
        @Size(max = 80, message = "메뉴는 80개까지 담을 수 있어요.")
        List<@Valid Item> items,

        String photoUrl
) {
    public record Item(
            @NotBlank(message = "메뉴 이름을 적어 주세요.")
            @Size(max = 100, message = "메뉴 이름은 100자까지예요.")
            String name,

            @Min(value = 0, message = "가격은 0원 이상이어야 해요.")
            @Max(value = 10_000_000, message = "가격이 너무 커요.")
            Integer price
    ) {
    }
}
