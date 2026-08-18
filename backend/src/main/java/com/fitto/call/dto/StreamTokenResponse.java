package com.fitto.call.dto;

/** GET /api/v1/call-spike/token — 클라이언트가 StreamVideoClient 를 초기화하는 데 필요한 값. */
public record StreamTokenResponse(
        String apiKey,
        String token,
        /** Stream user_id — Doubly userId 를 그대로 문자열로 쓴다 */
        String userId
) {
}
