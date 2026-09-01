package com.fitto.diet.controller;

import com.fitto.common.ai.AiJobResponse;
import com.fitto.common.ai.AiJobService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.dto.AnalyzeMealRequest;
import com.fitto.diet.dto.AnalyzeMealTextRequest;
import com.fitto.diet.dto.CoupleMealGoalResponse;
import com.fitto.diet.dto.DietCoachResponse;
import com.fitto.diet.dto.MealAnalysisResponse;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.MealStatsResponse;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.NutritionGoalSuggestionRequest;
import com.fitto.diet.dto.NutritionGoalSuggestionResponse;
import com.fitto.diet.dto.NutritionSummaryResponse;
import com.fitto.diet.dto.RecentFoodResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.DietCoachService;
import com.fitto.diet.service.FoodAnalysisService;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.NutritionService;
import org.springframework.web.bind.annotation.PutMapping;
import com.fitto.workout.dto.CalendarDayResponse;
import com.fitto.workout.dto.PartnerTodayResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 식단 기록 API — 운동(WorkoutController) 구조를 미러링.
 */
@RestController
@RequestMapping("/api/v1/meal")
public class MealController {

    private final MealService mealService;
    private final FoodAnalysisService foodAnalysisService;
    private final DietCoachService dietCoachService;
    private final NutritionService nutritionService;
    private final AiJobService aiJobService;

    public MealController(MealService mealService, FoodAnalysisService foodAnalysisService,
                          DietCoachService dietCoachService, NutritionService nutritionService,
                          AiJobService aiJobService) {
        this.mealService = mealService;
        this.foodAnalysisService = foodAnalysisService;
        this.dietCoachService = dietCoachService;
        this.nutritionService = nutritionService;
        this.aiJobService = aiJobService;
    }

    @PostMapping
    public ApiResponse<MealResponse> save(@AuthenticationPrincipal AuthUser user,
                                          @Valid @RequestBody SaveMealRequest request) {
        return ApiResponse.success(mealService.save(user.id(), request), "식단이 기록되었습니다.");
    }

    /**
     * 기록 수정 — 반찬(항목) 하나만 고치거나 빼는 경로. 항목 목록은 전량 교체다
     * (요청에 담긴 것이 곧 최종 상태). {@link SaveMealRequest} 를 그대로 쓴다.
     */
    @PutMapping("/{id}")
    public ApiResponse<MealResponse> update(@AuthenticationPrincipal AuthUser user,
                                            @PathVariable Long id,
                                            @Valid @RequestBody SaveMealRequest request) {
        return ApiResponse.success(mealService.update(user.id(), id, request), "식단이 수정되었습니다.");
    }

    /**
     * 음식 사진 AI 분석 — 결과는 추정치이며 저장은 기존 POST /meal 로 사용자가 확정한다.
     *
     * <p>결과가 아니라 접수증(202 + jobId)을 돌려준다 — 모든 AI 기능이 같은 규칙이다.
     * Gemini 실패는 사실상 전부 503(모델 과부하)이고 몇 분씩 이어지는데, 요청 안에서는
     * 그 구간을 넘길 방법이 없다. 작업으로 떼어내면 분 단위 재시도와 모델 폴백을 쓸 수 있다.
     * 앱은 {@code GET /ai/jobs/{jobId}} 로 결과를 가져간다.
     */
    @PostMapping("/analyze")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<AiJobResponse> analyze(@AuthenticationPrincipal AuthUser user,
                                              @Valid @RequestBody AnalyzeMealRequest request) {
        Long userId = user.id();
        String photoUrl = request.photoUrl();
        return ApiResponse.success(
                new AiJobResponse(aiJobService.submit(userId, "food-photo",
                        () -> foodAnalysisService.analyze(userId, photoUrl))),
                "AI가 사진을 보고 있어요.");
    }

    /** 음식 텍스트 AI 분석 — 메모("단백질쉐이크, 계란")로 칼로리 추정. 접수증은 위 analyze 와 같다. */
    @PostMapping("/analyze-text")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<AiJobResponse> analyzeText(@AuthenticationPrincipal AuthUser user,
                                                  @Valid @RequestBody AnalyzeMealTextRequest request) {
        Long userId = user.id();
        String text = request.text();
        return ApiResponse.success(
                new AiJobResponse(aiJobService.submit(userId, "food-text",
                        () -> foodAnalysisService.analyzeText(userId, text))),
                "AI가 계산하고 있어요.");
    }

    /**
     * 지정한 날짜(기본: 어제)의 식단을 오늘 날짜로 통째로 복사 — "어제 식단 불러오기" 3초 퀵 로깅.
     */
    @PostMapping("/copy")
    public ApiResponse<List<MealResponse>> copyFrom(@AuthenticationPrincipal AuthUser user,
                                                     @RequestParam(required = false) LocalDate sourceDate) {
        LocalDate from = sourceDate != null ? sourceDate : LocalDate.now().minusDays(1);
        return ApiResponse.success(mealService.copyFrom(user.id(), from), "어제 식단을 불러왔어요.");
    }

    @GetMapping("/today")
    public ApiResponse<List<MealResponse>> today(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(mealService.findToday(user.id()));
    }

    @GetMapping("/history")
    public ApiResponse<List<MealResponse>> history(@AuthenticationPrincipal AuthUser user,
                                                   @RequestParam(required = false) Long cursor) {
        return ApiResponse.success(mealService.findHistory(user.id(), cursor));
    }

    @GetMapping("/calendar")
    public ApiResponse<List<CalendarDayResponse>> calendar(@AuthenticationPrincipal AuthUser user,
                                                           @RequestParam int year,
                                                           @RequestParam int month) {
        return ApiResponse.success(mealService.calendar(user.id(), year, month));
    }

    @GetMapping("/stats")
    public ApiResponse<MealStatsResponse> stats(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(mealService.stats(user.id()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        mealService.delete(user.id(), id);
        return ApiResponse.success(null, "식단 기록이 삭제되었습니다.");
    }

    @GetMapping("/partner/today")
    public ApiResponse<PartnerTodayResponse> partnerToday(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(mealService.partnerToday(user.id()));
    }

    @GetMapping("/couple/goal")
    public ApiResponse<CoupleMealGoalResponse> coupleGoal(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(mealService.coupleGoal(user.id()));
    }

    /** 주간 식단 AI 코칭 — 최근 7일 기록 기반 영양 균형 피드백. 접수증은 analyze 와 같다. */
    @PostMapping("/coach")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<AiJobResponse> coach(@AuthenticationPrincipal AuthUser user,
                                            @RequestParam(defaultValue = "false") boolean refresh) {
        Long userId = user.id();
        return ApiResponse.success(
                new AiJobResponse(aiJobService.submit(userId, "diet-coach",
                        () -> dietCoachService.coach(userId, refresh))),
                "코칭을 준비하고 있어요.");
    }

    /** 오늘 영양 요약 (목표 대비 섭취) */
    @GetMapping("/nutrition")
    public ApiResponse<NutritionSummaryResponse> nutrition(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(nutritionService.today(user.id()));
    }

    /** 영양 목표 설정 */
    @PutMapping("/nutrition/goal")
    public ApiResponse<NutritionSummaryResponse> setGoal(@AuthenticationPrincipal AuthUser user,
                                                         @jakarta.validation.Valid @RequestBody NutritionGoalRequest request) {
        return ApiResponse.success(nutritionService.setGoal(user.id(), request), "목표를 저장했어요.");
    }

    /**
     * 목표 칼로리 자동 계산(TDEE 마법사) — 계산만 하고 저장은 안 한다.
     * 결과를 확인한 사용자가 위 {@code PUT /nutrition/goal} 로 확정 저장한다.
     */
    @PostMapping("/nutrition/goal/suggest")
    public ApiResponse<NutritionGoalSuggestionResponse> suggestGoal(
            @AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody NutritionGoalSuggestionRequest request) {
        return ApiResponse.success(nutritionService.suggestGoal(user.id(), request));
    }

    /** 최근 먹은 음식 자동완성 — 즐겨찾기와 달리 저장 없이 최근 기록에서 자동으로 뽑힌다 */
    @GetMapping("/recent-foods")
    public ApiResponse<List<RecentFoodResponse>> recentFoods(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(mealService.recentFoods(user.id()));
    }
}
