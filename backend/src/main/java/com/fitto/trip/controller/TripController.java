package com.fitto.trip.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.GenerateItineraryRequest;
import com.fitto.trip.dto.ReorderTripItemsRequest;
import com.fitto.trip.dto.SaveTripItemRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripDayResponse;
import com.fitto.trip.dto.TripDetailResponse;
import com.fitto.trip.dto.TripItemResponse;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.dto.UpdateTripItemRequest;
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

    // ---- 일자별 일정표 (Itinerary) ----

    @GetMapping("/{id}/items")
    public ApiResponse<List<TripDayResponse>> items(@AuthenticationPrincipal AuthUser user,
                                                    @PathVariable Long id) {
        return ApiResponse.success(tripService.items(user.id(), id));
    }

    @PostMapping("/{id}/items")
    public ApiResponse<TripItemResponse> addItem(@AuthenticationPrincipal AuthUser user,
                                                 @PathVariable Long id,
                                                 @Valid @RequestBody SaveTripItemRequest request) {
        return ApiResponse.success(tripService.addItem(user.id(), id, request), "일정을 추가했습니다.");
    }

    /** AI 여행 일정 생성 — 기존 일정을 대체한다. 본문(요청사항)은 선택. */
    @PostMapping("/{id}/items/generate")
    public ApiResponse<List<TripDayResponse>> generate(@AuthenticationPrincipal AuthUser user,
                                                       @PathVariable Long id,
                                                       @Valid @RequestBody(required = false)
                                                       GenerateItineraryRequest request) {
        String preferences = request != null ? request.preferences() : null;
        return ApiResponse.success(tripService.generateItinerary(user.id(), id, preferences),
                "AI가 여행 일정을 짰어요.");
    }

    /** 순서 일괄 변경 — {itemId} 보다 먼저 매칭되도록 리터럴 경로 사용. */
    @PutMapping("/{id}/items/reorder")
    public ApiResponse<Void> reorderItems(@AuthenticationPrincipal AuthUser user,
                                          @PathVariable Long id,
                                          @Valid @RequestBody ReorderTripItemsRequest request) {
        tripService.reorderItems(user.id(), id, request);
        return ApiResponse.success(null, "일정 순서를 바꿨습니다.");
    }

    @PutMapping("/{id}/items/{itemId}")
    public ApiResponse<TripItemResponse> updateItem(@AuthenticationPrincipal AuthUser user,
                                                    @PathVariable Long id,
                                                    @PathVariable Long itemId,
                                                    @Valid @RequestBody UpdateTripItemRequest request) {
        return ApiResponse.success(tripService.updateItem(user.id(), id, itemId, request), "일정을 수정했습니다.");
    }

    @DeleteMapping("/{id}/items/{itemId}")
    public ApiResponse<Void> deleteItem(@AuthenticationPrincipal AuthUser user,
                                        @PathVariable Long id,
                                        @PathVariable Long itemId) {
        tripService.deleteItem(user.id(), id, itemId);
        return ApiResponse.success(null, "일정을 삭제했습니다.");
    }
}
