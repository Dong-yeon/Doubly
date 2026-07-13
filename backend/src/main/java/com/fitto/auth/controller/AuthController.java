package com.fitto.auth.controller;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.dto.UpdateProfileRequest;
import com.fitto.auth.dto.UserResponse;
import com.fitto.auth.service.AuthService;
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

    public AuthController(AuthService authService) {
        this.authService = authService;
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
