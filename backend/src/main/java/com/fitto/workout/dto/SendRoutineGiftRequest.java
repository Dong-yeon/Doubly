package com.fitto.workout.dto;

import jakarta.validation.constraints.Size;

/** 루틴 선물 전송 요청 — message 는 선택(예: "우리 이번 주 같이 해볼까?"). */
public record SendRoutineGiftRequest(
        @Size(max = 200) String message
) {
}
