package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 넷이 같아 한 수 — 놓기와 주기를 <b>한 요청</b>으로 받는다(둘 사이에 판이 반쯤 바뀐 상태가 없게).
 *
 * <p>첫 수 {@code {give}} / 보통 수 {@code {place, give}} / 이기는 수·16번째 수 {@code {place}}.
 * 15번째 놓기 뒤에는 {@code give} 를 비워도 서버가 남은 한 말로 채운다.
 *
 * @param clientMoveId 앱이 만든 멱등키 — 같은 키가 다시 오면 새로 두지 않고 저장된 결과를 돌려준다
 * @param place        놓을 칸 0~15 ({@code row * 4 + col})
 * @param give         상대에게 줄 말 0~15
 * @param piece        앱이 놓는다고 믿는 말(받은 말) — 선택. 보내면 서버가 받은 말과 대조한다
 */
public record QuartoMoveRequest(
        @NotBlank @Size(max = 64) String clientMoveId,
        Integer place,
        Integer give,
        Integer piece
) {
}
