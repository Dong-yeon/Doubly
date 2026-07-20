package com.fitto.auth.controller;

import com.fitto.auth.dto.ChangePasswordRequest;
import com.fitto.auth.dto.ForgotPasswordRequest;
import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.MarketingConsentRequest;
import com.fitto.auth.dto.NotificationSettingRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.ResetPasswordRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.dto.UpdateProfileRequest;
import com.fitto.auth.dto.UserResponse;
import com.fitto.auth.service.AuthService;
import com.fitto.auth.service.PasswordResetService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 인증 API — 설계서 4.2.
 * 소셜 로그인(/auth/kakao, /auth/apple)은 외부 OAuth 연동이 필요해 추후 구현.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final String BEARER = "Bearer ";

    private final AuthService authService;
    private final PasswordResetService passwordResetService;

    public AuthController(AuthService authService, PasswordResetService passwordResetService) {
        this.authService = authService;
        this.passwordResetService = passwordResetService;
    }

    @PostMapping("/register")
    public ApiResponse<TokenResponse> register(@Valid @RequestBody RegisterRequest request,
                                               HttpServletRequest http) {
        return ApiResponse.success(
                authService.register(request, clientIp(http)), "회원가입이 완료되었습니다.");
    }

    @PostMapping("/login")
    public ApiResponse<TokenResponse> login(@Valid @RequestBody LoginRequest request,
                                            HttpServletRequest http) {
        return ApiResponse.success(authService.login(request, clientIp(http)));
    }

    @PostMapping("/refresh")
    public ApiResponse<TokenResponse> refresh(@RequestHeader("Authorization") String authorization,
                                              HttpServletRequest http) {
        return ApiResponse.success(authService.refresh(bearerToken(authorization), clientIp(http)));
    }

    /** 로그아웃 — 리프레시 토큰을 서버에서 폐기한다(만료 전이라도 재사용 불가). */
    @PostMapping("/logout")
    public ApiResponse<Void> logout(@RequestHeader("Authorization") String authorization) {
        authService.logout(bearerToken(authorization));
        return ApiResponse.success(null, "로그아웃되었습니다.");
    }

    @GetMapping("/me")
    public ApiResponse<UserResponse> me(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(authService.getMe(user.id()));
    }

    @PutMapping("/me")
    public ApiResponse<UserResponse> updateMe(@AuthenticationPrincipal AuthUser user,
                                              @Valid @RequestBody UpdateProfileRequest request) {
        return ApiResponse.success(
                authService.updateMe(user.id(), request.name(), request.profileImageUrl()),
                "프로필이 수정되었습니다.");
    }

    /** 푸시 알림 수신 설정 — SET-01. */
    @PutMapping("/me/notification-setting")
    public ApiResponse<UserResponse> updateNotificationSetting(
            @AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody NotificationSettingRequest request) {
        UserResponse updated = authService.updateNotificationSetting(user.id(), request.enabled());
        return ApiResponse.success(updated,
                request.enabled() ? "알림을 받습니다." : "알림을 껐습니다.");
    }

    /** 마케팅 수신 동의/철회 — AUTH-09. */
    @PutMapping("/me/marketing-consent")
    public ApiResponse<UserResponse> updateMarketingConsent(
            @AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody MarketingConsentRequest request) {
        UserResponse updated = authService.updateMarketingConsent(user.id(), request.agreed());
        return ApiResponse.success(updated,
                request.agreed() ? "마케팅 수신에 동의했습니다." : "마케팅 수신을 철회했습니다.");
    }

    /**
     * 비밀번호 재설정 코드 발송 — AUTH-07.
     * 가입되지 않은 이메일이어도 동일한 성공 응답을 준다(가입 여부 노출 방지).
     */
    @PostMapping("/password/forgot")
    public ApiResponse<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request,
                                            HttpServletRequest http) {
        passwordResetService.sendResetCode(request.email(), clientIp(http));
        return ApiResponse.success(null,
                "입력하신 이메일로 인증코드를 보냈습니다. 메일함을 확인해주세요.");
    }

    /** 인증코드로 비밀번호 재설정 — AUTH-07. 성공 시 기존 세션이 모두 만료되어 재로그인이 필요하다. */
    @PostMapping("/password/reset")
    public ApiResponse<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request,
                                           HttpServletRequest http) {
        passwordResetService.resetPassword(
                request.email(), request.code(), request.newPassword(), clientIp(http));
        return ApiResponse.success(null, "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.");
    }

    /** 로그인 상태에서 비밀번호 변경 — AUTH-08. 성공 시 모든 기기에서 로그아웃된다. */
    @PostMapping("/password/change")
    public ApiResponse<Void> changePassword(@AuthenticationPrincipal AuthUser user,
                                            @Valid @RequestBody ChangePasswordRequest request) {
        passwordResetService.changePassword(
                user.id(), request.currentPassword(), request.newPassword());
        return ApiResponse.success(null, "비밀번호가 변경되었습니다. 다시 로그인해주세요.");
    }

    @DeleteMapping("/withdraw")
    public ApiResponse<Void> withdraw(@AuthenticationPrincipal AuthUser user) {
        authService.withdraw(user.id());
        return ApiResponse.success(null, "탈퇴가 완료되었습니다.");
    }

    // ---- helpers ----

    private String bearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith(BEARER)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        return authorization.substring(BEARER.length());
    }

    /**
     * 클라이언트 IP — 레이트리밋 키. Railway 등 프록시 뒤에서는 X-Forwarded-For 의
     * 첫 값(원 클라이언트)을 사용하고, 직접 연결이면 remote address 를 쓴다.
     */
    private String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }
}
