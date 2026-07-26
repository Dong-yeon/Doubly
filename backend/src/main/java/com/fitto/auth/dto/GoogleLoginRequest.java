package com.fitto.auth.dto;

import jakarta.validation.constraints.NotBlank;

/** 구글 로그인 — 클라이언트(expo-auth-session)가 받은 ID 토큰을 전달한다. */
public record GoogleLoginRequest(
        @NotBlank(message = "구글 인증 토큰이 필요합니다.")
        String idToken
) {
}
