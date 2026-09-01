package com.fitto.common.ai;

/**
 * 오래 걸리는 AI 요청의 <b>접수증</b> — 결과가 아니라 "받았고 만들고 있다"는 응답이다.
 * 앱은 이 id 로 {@code GET /ai/jobs/{jobId}} 를 폴링한다.
 */
public record AiJobResponse(String jobId) {
}
