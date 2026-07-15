package com.fitto.trip.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.TripRecapResponse;
import com.fitto.trip.service.TripRecapService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 커플 여행 회고 카드 API — PLAN.md Trip Recap.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/recap")
public class TripRecapController {

    private final TripRecapService tripRecapService;

    public TripRecapController(TripRecapService tripRecapService) {
        this.tripRecapService = tripRecapService;
    }

    @GetMapping
    public ApiResponse<TripRecapResponse> recap(@AuthenticationPrincipal AuthUser user,
                                                @PathVariable Long tripId) {
        return ApiResponse.success(tripRecapService.recap(user.id(), tripId));
    }
}
