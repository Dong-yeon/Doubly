package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 폴링 응답 — 작업 하나의 현재 상태.
 *
 * <p>{@code result} 가 {@link JsonNode} 인 이유: 작업마다 결과 타입이 다른데 폴링 엔드포인트는
 * 하나다. 서버가 타입을 다시 붙일 필요가 없고(앱이 무엇을 요청했는지 안다), 그대로 흘려보낸다.
 */
public record AiJobStatusResponse(
        String status,
        JsonNode result,
        String errorCode,
        String message
) {

    public static AiJobStatusResponse of(AiJob job, ObjectMapper objectMapper) {
        JsonNode result = null;
        if (job.resultJson() != null) {
            try {
                result = objectMapper.readTree(job.resultJson());
            } catch (Exception ignored) {
                // 저장된 JSON 이 깨졌다면 결과 없이 상태만 내려간다 — 앱은 실패로 처리한다
            }
        }
        return new AiJobStatusResponse(
                job.status().name(), result, job.errorCode(), job.message());
    }
}
