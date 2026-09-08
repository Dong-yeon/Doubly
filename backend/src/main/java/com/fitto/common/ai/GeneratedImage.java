package com.fitto.common.ai;

/**
 * Gemini 이미지 생성 결과 한 장 — {@link GeminiClient#generateImageInBackground}.
 *
 * <p>{@code mimeType} 은 응답의 {@code inlineData.mimeType} 그대로다. 모델마다 다르다
 * (2.5-flash-image 는 PNG, 3.1-flash-image 는 JPEG 로 돌려준다 — 실측,
 * {@code docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md} §12-3). 저장할 때 확장자를 박지 말고 이 값을 따른다.
 */
public record GeneratedImage(byte[] bytes, String mimeType) {
}
