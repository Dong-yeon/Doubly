package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 탭 한 번 — {@code x, y} 는 이미지 기준 0~1(A·B 어느 쪽을 눌러도 같은 좌표계). 앱이 확대·이동을 풀어서 보낸다.
 * {@code clientTapId} 가 같으면 재전송으로 보고 저장된 결과를 돌려준다.
 */
public record SpotTapRequest(
        @NotBlank @Size(max = 64) String clientTapId,
        @NotNull Double x,
        @NotNull Double y
) {
}
