package com.fitto.mood.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.mood.dto.MoodCalendarResponse;
import com.fitto.mood.dto.MoodDayResponse;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.dto.MoodResponse;
import com.fitto.mood.service.MoodCalendarService;
import com.fitto.mood.service.MoodService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** 무드 상태 API — PLAN.md "무드 상태" 참고. */
@RestController
@RequestMapping("/api/v1/mood")
public class MoodController {

    private final MoodService moodService;
    private final MoodCalendarService moodCalendarService;

    public MoodController(MoodService moodService, MoodCalendarService moodCalendarService) {
        this.moodService = moodService;
        this.moodCalendarService = moodCalendarService;
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

    /** 무드 달력 한 달 — {@code ?month=2026-10}. 무료는 최근 30일만(나머지는 lockedBefore 로 표시) */
    @GetMapping("/calendar")
    public ApiResponse<MoodCalendarResponse> calendar(@AuthenticationPrincipal AuthUser user,
                                                      @RequestParam String month) {
        return ApiResponse.success(moodCalendarService.month(user.id(), month));
    }

    /** 그날 두 사람의 무드 흐름 */
    @GetMapping("/days/{date}")
    public ApiResponse<MoodDayResponse> day(@AuthenticationPrincipal AuthUser user,
                                            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.success(moodCalendarService.day(user.id(), date));
    }
}
