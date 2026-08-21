package com.fitto.call.dto;

/**
 * StreamVideoClient 초기화용 자격 — 로그인 직후 앱이 한 번 받아 클라이언트를 연결해 둔다
 * (연결돼 있어야 벨(ring)을 받을 수 있다). apiKey 는 공개값, token 은 이 사용자 전용.
 */
public record StreamCredentialsResponse(String apiKey, String userId, String token) {
}
