package com.fitto.trainer.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trainer.dto.AssignRoutineRequest;
import com.fitto.trainer.dto.TrainerDashboardResponse;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.dto.TrainerProfileResponse;
import com.fitto.trainer.dto.TrainerRoutineResponse;
import com.fitto.trainer.service.TrainerService;
import com.fitto.workout.dto.WorkoutResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

    // ---- 루틴 (phase 7) ----

    @PostMapping("/routines")
    public ApiResponse<TrainerRoutineResponse> assignRoutine(@AuthenticationPrincipal AuthUser user,
                                                             @Valid @RequestBody AssignRoutineRequest request) {
        return ApiResponse.success(trainerService.assignRoutine(user.id(), request), "루틴이 배정되었습니다.");
    }

    /** 트레이너 — 특정 회원에게 배정한 루틴 목록 */
    @GetMapping("/routines")
    public ApiResponse<List<TrainerRoutineResponse>> memberRoutines(@AuthenticationPrincipal AuthUser user,
                                                                    @RequestParam Long memberId) {
        return ApiResponse.success(trainerService.memberRoutines(user.id(), memberId));
    }

    /** 회원 — 내가 받은 루틴 목록 */
    @GetMapping("/routines/my")
    public ApiResponse<List<TrainerRoutineResponse>> myRoutines(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(trainerService.myRoutines(user.id()));
    }

    /** 회원 — 루틴 완료 체크 */
    @PostMapping("/routines/{id}/complete")
    public ApiResponse<TrainerRoutineResponse> completeRoutine(@AuthenticationPrincipal AuthUser user,
                                                               @PathVariable Long id) {
        return ApiResponse.success(trainerService.completeRoutine(user.id(), id), "루틴을 완료했어요! 💪");
    }

    /** 트레이너 — 배정한 루틴 삭제 */
    @DeleteMapping("/routines/{id}")
    public ApiResponse<Void> deleteRoutine(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        trainerService.deleteRoutine(user.id(), id);
        return ApiResponse.success(null, "루틴이 삭제되었습니다.");
    }
}
