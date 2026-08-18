package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.dto.AddWaterRequest;
import com.fitto.diet.dto.SetWaterGoalRequest;
import com.fitto.diet.dto.WaterSummaryResponse;
import com.fitto.diet.service.WaterService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 물 섭취 트래커 API. */
@RestController
@RequestMapping("/api/v1/water")
public class WaterController {

    private final WaterService waterService;

    public WaterController(WaterService waterService) {
        this.waterService = waterService;
    }

    @GetMapping("/today")
    public ApiResponse<WaterSummaryResponse> today(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(waterService.today(user.id()));
    }

    @PostMapping("/add")
    public ApiResponse<WaterSummaryResponse> add(@AuthenticationPrincipal AuthUser user,
                                                 @Valid @RequestBody AddWaterRequest request) {
        return ApiResponse.success(waterService.add(user.id(), request.amountMl()), "물 섭취를 기록했어요.");
    }

    @PutMapping("/goal")
    public ApiResponse<WaterSummaryResponse> setGoal(@AuthenticationPrincipal AuthUser user,
                                                     @Valid @RequestBody SetWaterGoalRequest request) {
        return ApiResponse.success(waterService.setGoal(user.id(), request.targetMl()), "목표를 저장했어요.");
    }
}
