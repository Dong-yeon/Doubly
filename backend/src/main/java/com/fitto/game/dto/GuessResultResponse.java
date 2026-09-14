package com.fitto.game.dto;

/**
 * 정답 시도 결과.
 *
 * <p>{@code game} 만 돌려주고 앱이 status 로 판단하게 할 수도 있지만, "틀렸다"와 "맞혔다"는
 * 화면 반응이 완전히 다르므로(흔들림 vs 축하) 한 눈에 보이는 필드로 둔다.
 */
public record GuessResultResponse(boolean correct, CatchMindResponse game) {
}
