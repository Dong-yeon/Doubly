package com.fitto.workout.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.service.WorkoutRoutineService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 사용자 본인 운동 루틴 API — 짐앱 스타일 루틴 템플릿.
 */
@RestController
@RequestMapping("/api/v1/workout/routines")
public class WorkoutRoutineController {

    private final WorkoutRoutineService routineService;

    public WorkoutRoutineController(WorkoutRoutineService routineService) {
        this.routineService = routineService;
    }

    @GetMapping
    public ApiResponse<List<RoutineResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(routineService.list(user.id()));
    }

    @GetMapping("/{id}")
    public ApiResponse<RoutineResponse> detail(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(routineService.detail(user.id(), id));
    }

    @PostMapping
    public ApiResponse<RoutineResponse> save(@AuthenticationPrincipal AuthUser user,
                                             @Valid @RequestBody SaveRoutineRequest request) {
        return ApiResponse.success(routineService.save(user.id(), request), "루틴을 저장했어요.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        routineService.delete(user.id(), id);
        return ApiResponse.success(null, "루틴을 삭제했어요.");
    }
}
