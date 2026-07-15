package com.fitto.trip.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.SaveTripExpenseRequest;
import com.fitto.trip.dto.TripExpenseResponse;
import com.fitto.trip.dto.TripExpensesResponse;
import com.fitto.trip.service.TripExpenseService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 커플 여행 경비 정산 API — PLAN.md Trip Expenses.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/expenses")
public class TripExpenseController {

    private final TripExpenseService tripExpenseService;

    public TripExpenseController(TripExpenseService tripExpenseService) {
        this.tripExpenseService = tripExpenseService;
    }

    @GetMapping
    public ApiResponse<TripExpensesResponse> list(@AuthenticationPrincipal AuthUser user,
                                                  @PathVariable Long tripId) {
        return ApiResponse.success(tripExpenseService.list(user.id(), tripId));
    }

    @PostMapping
    public ApiResponse<TripExpenseResponse> add(@AuthenticationPrincipal AuthUser user,
                                                @PathVariable Long tripId,
                                                @Valid @RequestBody SaveTripExpenseRequest request) {
        return ApiResponse.success(tripExpenseService.add(user.id(), tripId, request), "경비를 추가했습니다.");
    }

    @PutMapping("/{expenseId}")
    public ApiResponse<TripExpenseResponse> update(@AuthenticationPrincipal AuthUser user,
                                                   @PathVariable Long tripId,
                                                   @PathVariable Long expenseId,
                                                   @Valid @RequestBody SaveTripExpenseRequest request) {
        return ApiResponse.success(tripExpenseService.update(user.id(), tripId, expenseId, request),
                "경비를 수정했습니다.");
    }

    @DeleteMapping("/{expenseId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user,
                                    @PathVariable Long tripId,
                                    @PathVariable Long expenseId) {
        tripExpenseService.delete(user.id(), tripId, expenseId);
        return ApiResponse.success(null, "경비를 삭제했습니다.");
    }
}
