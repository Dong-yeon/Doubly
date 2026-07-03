package com.fitto.trainer.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trainer.dto.TrainerDashboardResponse;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.dto.TrainerProfileResponse;
import com.fitto.trainer.service.TrainerService;
import com.fitto.workout.dto.WorkoutResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 트레이너 API — 설계서 4.6. 등록·프로필·대시보드·회원 기록 조회.
 */
@RestController
@RequestMapping("/api/v1/trainer")
public class TrainerController {

    private final TrainerService trainerService;

    public TrainerController(TrainerService trainerService) {
        this.trainerService = trainerService;
    }

    @PostMapping("/register")
    public ApiResponse<TrainerProfileResponse> register(@AuthenticationPrincipal AuthUser user,
                                                        @Valid @RequestBody TrainerProfileRequest request) {
        return ApiResponse.success(trainerService.register(user.id(), request), "트레이너로 등록되었습니다.");
    }

    @GetMapping("/profile")
    public ApiResponse<TrainerProfileResponse> myProfile(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(trainerService.myProfile(user.id()));
    }

    @PutMapping("/profile")
    public ApiResponse<TrainerProfileResponse> updateProfile(@AuthenticationPrincipal AuthUser user,
                                                             @Valid @RequestBody TrainerProfileRequest request) {
        return ApiResponse.success(trainerService.updateProfile(user.id(), request), "프로필이 수정되었습니다.");
    }

    @GetMapping("/dashboard")
    public ApiResponse<TrainerDashboardResponse> dashboard(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(trainerService.dashboard(user.id()));
    }

    @GetMapping("/members/{memberId}/workouts")
    public ApiResponse<List<WorkoutResponse>> memberWorkouts(@AuthenticationPrincipal AuthUser user,
                                                             @PathVariable Long memberId) {
        return ApiResponse.success(trainerService.memberWorkouts(user.id(), memberId));
    }
}
