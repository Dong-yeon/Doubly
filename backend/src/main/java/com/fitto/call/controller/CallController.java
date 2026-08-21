package com.fitto.call.controller;

import com.fitto.call.dto.CallJoinResponse;
import com.fitto.call.dto.CallSessionResponse;
import com.fitto.call.dto.StartCallRequest;
import com.fitto.call.dto.StreamCredentialsResponse;
import com.fitto.call.service.CallService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 통화 — PLAN.md "통화·영상통화" 1단계 API. */
@RestController
@RequestMapping("/api/v1/calls")
public class CallController {

    private final CallService callService;

    public CallController(CallService callService) {
        this.callService = callService;
    }

    /** StreamVideoClient 초기화용 자격 — 로그인 직후 1회 호출. */
    @GetMapping("/token")
    public ApiResponse<StreamCredentialsResponse> token(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(callService.credentials(user.id()));
    }

    @PostMapping
    public ApiResponse<CallJoinResponse> start(@AuthenticationPrincipal AuthUser user,
                                               @Valid @RequestBody StartCallRequest request) {
        return ApiResponse.success(callService.start(user.id(), request));
    }

    @PostMapping("/{id}/accept")
    public ApiResponse<CallJoinResponse> accept(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(callService.accept(user.id(), id));
    }

    @PostMapping("/{id}/decline")
    public ApiResponse<CallSessionResponse> decline(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(callService.decline(user.id(), id));
    }

    @PostMapping("/{id}/end")
    public ApiResponse<CallSessionResponse> end(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(callService.end(user.id(), id));
    }

    @GetMapping("/{id}")
    public ApiResponse<CallSessionResponse> get(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(callService.get(user.id(), id));
    }

    @GetMapping
    public ApiResponse<List<CallSessionResponse>> list(@AuthenticationPrincipal AuthUser user,
                                                       @RequestParam(required = false) Long cursor) {
        return ApiResponse.success(callService.list(user.id(), cursor));
    }
}
