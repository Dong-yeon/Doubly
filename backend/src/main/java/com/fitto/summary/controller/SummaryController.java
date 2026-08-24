package com.fitto.summary.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.summary.dto.LevelResponse;
import com.fitto.summary.dto.WeeklyLetterResponse;
import com.fitto.summary.dto.WeeklyRecapResponse;
import com.fitto.summary.service.SummaryService;
import com.fitto.summary.service.WeeklyLetterService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 결산 API — GET /summary/weekly-recap (지난주 운동+식단 요약).
 */
@RestController
@RequestMapping("/api/v1/summary")
public class SummaryController {

    private final SummaryService summaryService;
    private final WeeklyLetterService weeklyLetterService;

    public SummaryController(SummaryService summaryService, WeeklyLetterService weeklyLetterService) {
        this.summaryService = summaryService;
        this.weeklyLetterService = weeklyLetterService;
    }

    @GetMapping("/weekly-recap")
    public ApiResponse<WeeklyRecapResponse> weeklyRecap(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(summaryService.weeklyRecap(user.id()));
    }

    @GetMapping("/level")
    public ApiResponse<LevelResponse> level(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(summaryService.level(user.id()));
    }

    /** AI 커플 주간 레터 — 지난주 결산을 다정한 글로 (GET /summary/ai-letter) */
    @GetMapping("/ai-letter")
    public ApiResponse<WeeklyLetterResponse> aiLetter(@AuthenticationPrincipal AuthUser user,
                                                      @RequestParam(defaultValue = "false") boolean refresh) {
        return ApiResponse.success(weeklyLetterService.letter(user.id(), refresh));
    }
}
