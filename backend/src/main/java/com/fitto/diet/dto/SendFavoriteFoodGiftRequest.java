package com.fitto.diet.dto;

import jakarta.validation.constraints.Size;

/** 즐겨찾기 음식 선물 전송 요청 — message 는 선택(예: "이거 진짜 맛있어, 한번 먹어봐"). */
public record SendFavoriteFoodGiftRequest(
        @Size(max = 200) String message
) {
}
