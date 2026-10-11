package com.fitto.auth.dto;

/** 인증 토큰 응답 — 설계서 4.2 / 4.4 AUTH-05 */
public record TokenResponse(
        String accessToken,
        String refreshToken,
        UserResponse user,
        /** 탈퇴 유예기간 중 로그인해 탈퇴가 취소됐으면 true — 앱이 취소 사실을 알린다 */
        boolean withdrawalCanceled
) {
    public TokenResponse withWithdrawalCanceled() {
        return new TokenResponse(accessToken, refreshToken, user, true);
    }
}
