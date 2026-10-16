package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.dto.FastingHistoryItem;
import com.fitto.diet.dto.FastingSettingsRequest;
import com.fitto.diet.dto.FastingSettingsResponse;
import com.fitto.diet.dto.FastingStatusResponse;
import com.fitto.diet.dto.PartnerFastingResponse;
import com.fitto.diet.dto.StartFastingRequest;
import com.fitto.diet.service.FastingService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 간헐적 단식 타이머 API — 커플 상대방 진행 상태 조회를 포함한다. */
@RestController
@RequestMapping("/api/v1/fasting")
public class FastingController {

    private final FastingService fastingService;

    public FastingController(FastingService fastingService) {
        this.fastingService = fastingService;
    }

    @PostMapping("/start")
    public ApiResponse<FastingStatusResponse> start(@AuthenticationPrincipal AuthUser user,
                                                     @Valid @RequestBody StartFastingRequest request) {
        return ApiResponse.success(fastingService.start(user.id(), request), "단식을 시작했어요.");
    }

    @PostMapping("/end")
    public ApiResponse<FastingStatusResponse> end(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(fastingService.end(user.id()), "단식을 종료했어요.");
    }

    @GetMapping("/active")
    public ApiResponse<FastingStatusResponse> active(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(fastingService.active(user.id()));
    }

    @GetMapping("/partner")
    public ApiResponse<PartnerFastingResponse> partner(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(fastingService.partner(user.id()));
    }

    /** 식사 기록으로 자동 종료된 단식을 되돌린다(토스트의 [되돌리기]) */
    @PostMapping("/reopen")
    public ApiResponse<FastingStatusResponse> reopen(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(fastingService.reopen(user.id()), "단식을 이어갈게요.");
    }

    @GetMapping("/history")
    public ApiResponse<List<FastingHistoryItem>> history(@AuthenticationPrincipal AuthUser user,
                                                         @RequestParam(defaultValue = "28") int days) {
        return ApiResponse.success(fastingService.history(user.id(), days));
    }

    @GetMapping("/settings")
    public ApiResponse<FastingSettingsResponse> settings(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(fastingService.settings(user.id()));
    }

    @PutMapping("/settings")
    public ApiResponse<FastingSettingsResponse> updateSettings(@AuthenticationPrincipal AuthUser user,
                                                               @RequestBody FastingSettingsRequest request) {
        return ApiResponse.success(fastingService.updateSettings(user.id(), request));
    }
}
