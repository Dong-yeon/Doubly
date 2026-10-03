package com.fitto.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** 이메일 로그인 요청 — 설계서 4.2 POST /auth/login */
public record LoginRequest(
        @Email(message = "올바른 이메일 형식이 아닙니다.") @NotBlank(message = "이메일을 입력해주세요.") String email,
        @NotBlank(message = "비밀번호를 입력해주세요.") String password
) {
    public LoginRequest {
        email = EmailNormalizer.normalize(email);
    }
}
