package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealReminderResponse;
import com.fitto.diet.dto.SetMealReminderRequest;
import com.fitto.diet.service.MealReminderService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 끼니 알림 설정 API — 아침/점심/저녁 각각 원하는 시간에 "기록했나요?" 를 받는다. */
@RestController
@RequestMapping("/api/v1/meal/reminders")
public class MealReminderController {

    private final MealReminderService reminderService;

    public MealReminderController(MealReminderService reminderService) {
        this.reminderService = reminderService;
    }

    @GetMapping
    public ApiResponse<List<MealReminderResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(reminderService.list(user.id()));
    }

    @PutMapping("/{mealType}")
    public ApiResponse<MealReminderResponse> set(@AuthenticationPrincipal AuthUser user,
                                                 @PathVariable MealType mealType,
                                                 @Valid @RequestBody SetMealReminderRequest request) {
        return ApiResponse.success(
                reminderService.set(user.id(), mealType, request.reminderTime()), "알림을 저장했어요.");
    }

    @DeleteMapping("/{mealType}")
    public ApiResponse<Void> remove(@AuthenticationPrincipal AuthUser user, @PathVariable MealType mealType) {
        reminderService.remove(user.id(), mealType);
        return ApiResponse.success(null, "알림을 껐어요.");
    }
}
