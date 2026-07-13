package com.fitto.trip.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripDetailResponse;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.dto.UpdateTripRequest;
import com.fitto.trip.service.TripService;
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

import java.util.List;

/**
 * 커플 여행 API — PLAN.md Trip.
 */
@RestController
@RequestMapping("/api/v1/trips")
public class TripController {

    private final TripService tripService;

    public TripController(TripService tripService) {
        this.tripService = tripService;
    }

    @PostMapping
    public ApiResponse<TripResponse> save(@AuthenticationPrincipal AuthUser user,
                                          @Valid @RequestBody SaveTripRequest request) {
        return ApiResponse.success(tripService.save(user.id(), request), "여행이 만들어졌습니다.");
    }

    @GetMapping
    public ApiResponse<List<TripResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(tripService.list(user.id()));
    }

    @GetMapping("/{id}")
    public ApiResponse<TripDetailResponse> detail(@AuthenticationPrincipal AuthUser user,
                                                  @PathVariable Long id) {
        return ApiResponse.success(tripService.detail(user.id(), id));
    }

    @PutMapping("/{id}")
    public ApiResponse<TripResponse> update(@AuthenticationPrincipal AuthUser user,
                                            @PathVariable Long id,
                                            @Valid @RequestBody UpdateTripRequest request) {
        return ApiResponse.success(tripService.update(user.id(), id, request), "여행이 수정되었습니다.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        tripService.delete(user.id(), id);
        return ApiResponse.success(null, "여행이 삭제되었습니다.");
    }

    @PostMapping("/{id}/places/{placeId}")
    public ApiResponse<Void> attachPlace(@AuthenticationPrincipal AuthUser user,
                                         @PathVariable Long id,
                                         @PathVariable Long placeId) {
        tripService.attachPlace(user.id(), id, placeId);
        return ApiResponse.success(null, "장소를 여행에 담았습니다.");
    }

    @DeleteMapping("/{id}/places/{placeId}")
    public ApiResponse<Void> detachPlace(@AuthenticationPrincipal AuthUser user,
                                         @PathVariable Long id,
                                         @PathVariable Long placeId) {
        tripService.detachPlace(user.id(), id, placeId);
        return ApiResponse.success(null, "장소를 여행에서 뺐습니다.");
    }
}
