package com.fitto.mood.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.dto.MoodResponse;
import com.fitto.mood.service.MoodService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 무드 상태 API — PLAN.md "무드 상태" 참고. */
@RestController
@RequestMapping("/api/v1/mood")
public class MoodController {

    private final MoodService moodService;

    public MoodController(MoodService moodService) {
        this.moodService = moodService;
    }

    @GetMapping
    public ApiResponse<MoodResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(moodService.current(user.id()));
    }

    @PostMapping
    public ApiResponse<MoodResponse> set(@AuthenticationPrincipal AuthUser user,
                                         @Valid @RequestBody MoodRequest request) {
        return ApiResponse.success(moodService.set(user.id(), request), "무드를 남겼어요.");
    }
}
