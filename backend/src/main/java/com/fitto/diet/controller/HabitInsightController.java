package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.dto.HabitInsightsResponse;
import com.fitto.diet.service.HabitInsightService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 물·단식 리포트 — 최근 4주의 본인 기록 비교(무료). 기간은 서버가 정한다(28일). */
@RestController
@RequestMapping("/api/v1/habits")
public class HabitInsightController {

    private final HabitInsightService habitInsightService;

    public HabitInsightController(HabitInsightService habitInsightService) {
        this.habitInsightService = habitInsightService;
    }

    @GetMapping("/insights")
    public ApiResponse<HabitInsightsResponse> insights(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(habitInsightService.insights(user.id()));
    }
}
