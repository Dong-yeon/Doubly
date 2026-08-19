package com.fitto.workout.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.workout.dto.RoutineGiftResponse;
import com.fitto.workout.dto.SendRoutineGiftRequest;
import com.fitto.workout.service.RoutineGiftService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 커플 루틴 선물하기 API — 내 운동 루틴을 애인에게 보내고 애인이 수락/거절한다.
 */
@RestController
@RequestMapping("/api/v1/workout/routine-gifts")
public class RoutineGiftController {

    private final RoutineGiftService giftService;

    public RoutineGiftController(RoutineGiftService giftService) {
        this.giftService = giftService;
    }

    @PostMapping("/{routineId}/send")
    public ApiResponse<RoutineGiftResponse> send(@AuthenticationPrincipal AuthUser user,
                                                  @PathVariable Long routineId,
                                                  @Valid @RequestBody SendRoutineGiftRequest request) {
        return ApiResponse.success(giftService.send(user.id(), routineId, request.message()), "루틴을 선물했어요.");
    }

    @GetMapping("/received")
    public ApiResponse<List<RoutineGiftResponse>> received(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(giftService.received(user.id()));
    }

    @GetMapping("/sent")
    public ApiResponse<List<RoutineGiftResponse>> sent(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(giftService.sent(user.id()));
    }

    @PostMapping("/{giftId}/accept")
    public ApiResponse<RoutineGiftResponse> accept(@AuthenticationPrincipal AuthUser user, @PathVariable Long giftId) {
        return ApiResponse.success(giftService.accept(user.id(), giftId), "루틴을 받았어요!");
    }

    @PostMapping("/{giftId}/decline")
    public ApiResponse<Void> decline(@AuthenticationPrincipal AuthUser user, @PathVariable Long giftId) {
        giftService.decline(user.id(), giftId);
        return ApiResponse.success(null, "선물을 정중히 사양했어요.");
    }
}
