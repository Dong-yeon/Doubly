package com.fitto.coupleemoji.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * POST /api/v1/couple-emojis/generate
 *
 * @param sourceImageUrl 앱이 {@code POST /couple-emojis/upload-signature} 로 받은 서명으로 올린 사진 URL.
 *                       전용 폴더에 올라간 것만 받는다 — 서버가 생성 뒤 원본을 지우기 때문에(§9) 아무 URL 이나
 *                       받으면 남의 사진을 지우는 경로가 된다.
 * @param subjectUserId  누구 얼굴인가 — 비우면 상대. 우리 둘 중 한 사람이어야 한다.
 */
public record GenerateCoupleEmojiRequest(
        @NotBlank String sourceImageUrl,
        Long subjectUserId
) {
}
