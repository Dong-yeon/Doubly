package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 벽 설치 요청.
 *
 * @param slot 8×8 교차점 0~63 ({@code r * 8 + c})
 * @param kind "H"(가로) 또는 "V"(세로). 벽 하나가 두 통로를 막는다
 */
public record PlaceWallRequest(int slot, @NotBlank String kind) {
}
