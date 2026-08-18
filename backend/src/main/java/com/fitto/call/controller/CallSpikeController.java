package com.fitto.call.controller;

import com.fitto.call.StreamTokenProperties;
import com.fitto.call.StreamTokenService;
import com.fitto.call.dto.StreamTokenResponse;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 통화 벨/웨이크업 스파이크 전용 API(claude/call-spike-android 브랜치).
 * PLAN.md "통화·영상통화" — 스파이크가 성공하면 이 패키지가 실제 구현의 씨앗이 된다.
 *
 * <p>Doubly 로그인 사용자만 Stream 토큰을 받을 수 있다 — 로그인 → 이 엔드포인트 →
 * StreamVideoClient 초기화 순서.
 */
@RestController
@RequestMapping("/api/v1/call-spike")
public class CallSpikeController {

    private final StreamTokenService tokenService;
    private final StreamTokenProperties properties;

    public CallSpikeController(StreamTokenService tokenService, StreamTokenProperties properties) {
        this.tokenService = tokenService;
        this.properties = properties;
    }

    @GetMapping("/token")
    public ApiResponse<StreamTokenResponse> token(@AuthenticationPrincipal AuthUser user) {
        if (!tokenService.isConfigured()) {
            throw new BusinessException(ErrorCode.STREAM_NOT_CONFIGURED);
        }
        String userId = String.valueOf(user.id());
        return ApiResponse.success(
                new StreamTokenResponse(properties.getApiKey(), tokenService.createToken(user.id()), userId));
    }
}
