package com.fitto.workout.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.workout.dto.CalendarDayResponse;
import com.fitto.workout.dto.ExerciseLastPerformanceRequest;
import com.fitto.workout.dto.ExerciseLastPerformanceResponse;
import com.fitto.workout.dto.MuscleRecoveryResponse;
import com.fitto.workout.dto.PartnerTodayResponse;
import com.fitto.workout.dto.RecommendWorkoutRequest;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutRecommendationResponse;
import com.fitto.workout.dto.WorkoutResponse;
import com.fitto.workout.dto.WorkoutStatsResponse;
import com.fitto.workout.service.MuscleRecoveryService;
import com.fitto.workout.service.WorkoutRecommendationService;
import com.fitto.workout.service.WorkoutService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 운동 기록 API — 설계서 4.4. 트레이너 루틴/회원조회 엔드포인트는 phase 7.
 */
@RestController
@RequestMapping("/api/v1/workout")
public class WorkoutController {

    private final WorkoutService workoutService;
    private final WorkoutRecommendationService recommendationService;
    private final MuscleRecoveryService muscleRecoveryService;

    public WorkoutController(WorkoutService workoutService,
                             WorkoutRecommendationService recommendationService,
                             MuscleRecoveryService muscleRecoveryService) {
        this.workoutService = workoutService;
        this.recommendationService = recommendationService;
        this.muscleRecoveryService = muscleRecoveryService;
    }

    @PostMapping
    public ApiResponse<WorkoutResponse> save(@AuthenticationPrincipal AuthUser user,
                                             @Valid @RequestBody SaveWorkoutRequest request) {
        return ApiResponse.success(workoutService.save(user.id(), request), "운동 기록이 저장되었습니다.");
    }

    /**
     * AI 운동 추천 — 최근 기록 기반으로 오늘(days=1) 또는 며칠간의 루틴을 제안.
     * weekdays 를 보내면(맞춤 프로그램 만들기) 그 요일마다 서로 다른 하루를 짜서 돌려준다.
     */
    @PostMapping("/recommend")
    public ApiResponse<WorkoutRecommendationResponse> recommend(@AuthenticationPrincipal AuthUser user,
                                                                @Valid @RequestBody RecommendWorkoutRequest request) {
        WorkoutRecommendationResponse response = request.isProgramMode()
                ? recommendationService.recommend(user.id(), request.weekdays(),
                        request.focusMuscleGroups(), request.goal(),
                        request.painAreas(), request.sessionMinutes())
                : recommendationService.recommend(user.id(), request.daysOrDefault());
        return ApiResponse.success(response, "AI 운동 추천이 완료되었습니다.");
    }

    /** 종목별 직전 수행 기록 배치 조회 — 세션 시작 시 무게/횟수 프리필(④). */
    @PostMapping("/exercises/last-performance")
    public ApiResponse<List<ExerciseLastPerformanceResponse>> lastPerformance(
            @AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody ExerciseLastPerformanceRequest request) {
        return ApiResponse.success(workoutService.lastPerformance(user.id(), request.exerciseNames()));
    }

    @GetMapping("/today")
    public ApiResponse<List<WorkoutResponse>> today(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(workoutService.findToday(user.id()));
    }

    @GetMapping("/history")
    public ApiResponse<List<WorkoutResponse>> history(@AuthenticationPrincipal AuthUser user,
                                                      @RequestParam(required = false) Long cursor) {
        return ApiResponse.success(workoutService.findHistory(user.id(), cursor));
    }

    @GetMapping("/calendar")
    public ApiResponse<List<CalendarDayResponse>> calendar(@AuthenticationPrincipal AuthUser user,
                                                           @RequestParam int year,
                                                           @RequestParam int month) {
        return ApiResponse.success(workoutService.calendar(user.id(), year, month));
    }

    @GetMapping("/stats")
    public ApiResponse<WorkoutStatsResponse> stats(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(workoutService.stats(user.id()));
    }

    /** 기록 단건 — 세트별 실기록까지 (운동 기록 상세 화면). */
    @GetMapping("/{id}")
    public ApiResponse<WorkoutResponse> one(@AuthenticationPrincipal AuthUser user,
                                            @PathVariable Long id) {
        return ApiResponse.success(workoutService.findOne(user.id(), id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        workoutService.delete(user.id(), id);
        return ApiResponse.success(null, "운동 기록이 삭제되었습니다.");
    }

    @GetMapping("/partner/today")
    public ApiResponse<PartnerTodayResponse> partnerToday(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(workoutService.partnerToday(user.id()));
    }

    /** 근육 회복 현황 — 부위별 마지막 수행 이후 경과 시간·추정 회복률(홈 화면 요약 카드). */
    @GetMapping("/recovery")
    public ApiResponse<MuscleRecoveryResponse> recovery(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(muscleRecoveryService.recovery(user.id()));
    }
}
