package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 그림 제출 = 판 시작. 그리는 동안은 서버에 아무것도 없으므로 이 한 번에 다 올라온다.
 *
 * @param word    제시어 — 후보에서 고르거나 직접 입력(둘만 아는 단어)
 * @param strokes "색,굵기,x1,y1,...;..." — {@link com.fitto.game.catchmind.Strokes} 가 검증한다
 */
public record StartCatchMindRequest(
        @NotBlank @Size(max = 40) String word,
        @NotBlank String strokes
) {
}
