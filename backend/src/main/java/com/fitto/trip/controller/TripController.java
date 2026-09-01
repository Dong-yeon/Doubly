package com.fitto.trip.controller;

import com.fitto.common.ai.AiJobResponse;
import com.fitto.common.ai.AiJobService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.GenerateItineraryRequest;
import com.fitto.trip.dto.ReorderTripItemsRequest;
import com.fitto.trip.dto.SaveTripItemRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.SetTravelModeRequest;
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
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
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
    private final AiJobService aiJobService;

    public TripController(TripService tripService, AiJobService aiJobService) {
        this.tripService = tripService;
        this.aiJobService = aiJobService;
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

    /** 여행 모드 토글 (PLAN.md Travel Mode) — 켜져 있으면 여행 기간 동안 식단 목표를 숨긴다. */
    @PutMapping("/{id}/travel-mode")
    public ApiResponse<TripResponse> setTravelMode(@AuthenticationPrincipal AuthUser user,
                                                   @PathVariable Long id,
                                                   @Valid @RequestBody SetTravelModeRequest request) {
        TripResponse trip = tripService.setTravelMode(user.id(), id, request.enabled());
        return ApiResponse.success(trip, trip.travelModeEnabled() ? "여행 모드를 켰어요." : "여행 모드를 껐어요.");
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

    /**
     * AI 여행 일정 생성 — 기존 일정을 대체한다. 본문(요청사항)은 선택.
     *
     * <p><b>결과가 아니라 접수증(202 + jobId)을 돌려준다.</b> 일정 생성은 AI 기능 중 가장
     * 무거운데(며칠치 일정을 한 번에), 실제 실패는 대부분 Gemini 503(모델 과부하)이고 그건
     * 몇 분씩 이어진다. 요청 안에서 기다리면 프론트 타임아웃 전에 포기할 수밖에 없어
     * 사용자에게는 그냥 실패다. 작업으로 떼어내면 분 단위로 재시도할 수 있고, 그 사이
     * 사용자는 화면을 떠나도 된다. 앱은 {@code GET /ai/jobs/{jobId}} 로 결과를 가져간다.
     */
    @PostMapping("/{id}/items/generate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<AiJobResponse> generate(@AuthenticationPrincipal AuthUser user,
                                               @PathVariable Long id,
                                               @Valid @RequestBody(required = false)
                                               GenerateItineraryRequest request) {
        String preferences = request != null ? request.preferences() : null;
        Long userId = user.id();
        String jobId = aiJobService.submit(userId, "trip-itinerary",
                () -> tripService.generateItinerary(userId, id, preferences));
        return ApiResponse.success(new AiJobResponse(jobId), "AI가 여행 일정을 짜고 있어요.");
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
