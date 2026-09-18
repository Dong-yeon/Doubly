package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 그림 제출 = 판 시작. 그리는 동안은 서버에 아무것도 없으므로 이 한 번에 다 올라온다.
 *
 * @param word           제시어 — 후보에서 고르거나 직접 입력(둘만 아는 단어)
 * @param strokes        "색,굵기,x1,y1,...;..." — {@link com.fitto.game.catchmind.Strokes} 가 검증한다
 * @param shareImageUrl  채팅에 남길 그림 PNG 의 Cloudinary URL — <b>선택</b>이다.
 *                       앱이 {@code POST /games/catch-mind/upload-signature} 서명으로 올린 것만
 *                       받으며, 서버가 폴더로 검증한다(CatchMindService.isShareUrl).
 *                       없으면 채팅 공유만 생략되고 판은 정상으로 선다 — 웹에는 SVG→PNG 렌더가
 *                       없고, 렌더·업로드가 실패해도 그림 제출을 막아선 안 된다.
 */
public record StartCatchMindRequest(
        @NotBlank @Size(max = 40) String word,
        @NotBlank String strokes,
        @Size(max = 500) String shareImageUrl
) {
}
