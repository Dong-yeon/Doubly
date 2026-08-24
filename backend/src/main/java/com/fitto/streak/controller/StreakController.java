package com.fitto.streak.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.streak.dto.StreakRepairResponse;
import com.fitto.streak.dto.StreakResponse;
import com.fitto.streak.service.StreakRepairService;
import com.fitto.streak.service.StreakService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 스트릭 API — 설계서 3.5 (GET /streak/me, /streak/couple).
 */
@RestController
@RequestMapping("/api/v1/streak")
public class StreakController {

    private final StreakService streakService;
    private final StreakRepairService streakRepairService;

    public StreakController(StreakService streakService, StreakRepairService streakRepairService) {
        this.streakService = streakService;
        this.streakRepairService = streakRepairService;
    }

    @GetMapping("/me")
    public ApiResponse<StreakResponse> me(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakService.getMyStreak(user.id()));
    }

    /** 상대의 개인 운동 스트릭 — 홈 위젯·응원 표시용. */
    @GetMapping("/partner")
    public ApiResponse<StreakResponse> partner(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakService.getPartnerStreak(user.id()));
    }

    @GetMapping("/couple")
    public ApiResponse<StreakResponse> couple(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakService.getCoupleStreak(user.id()));
    }

    @GetMapping("/meal/me")
    public ApiResponse<StreakResponse> mealMe(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakService.getMyMealStreak(user.id()));
    }

    @GetMapping("/meal/couple")
    public ApiResponse<StreakResponse> mealCouple(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakService.getCoupleMealStreak(user.id()));
    }

    /** 복구권 상태 — 되살릴 게 있는지·남은 횟수. 화면이 자동으로 부르므로 402 를 던지지 않는다. */
    @GetMapping("/repair")
    public ApiResponse<StreakRepairResponse> repairStatus(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakRepairService.status(user.id()));
    }

    /** 복구권 사용 — 어제 하루를 메워 연속을 잇는다. */
    @PostMapping("/repair")
    public ApiResponse<StreakRepairResponse> repair(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakRepairService.repair(user.id()), "스트릭을 되살렸어요!");
    }
}
