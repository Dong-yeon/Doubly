package com.fitto.trip.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.ChecklistItemResponse;
import com.fitto.trip.dto.ChecklistResponse;
import com.fitto.trip.dto.SaveChecklistItemRequest;
import com.fitto.trip.service.TripChecklistService;
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
 * 커플 여행 준비물 체크리스트 API — PLAN.md Trip Checklist.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/checklist")
public class TripChecklistController {

    private final TripChecklistService checklistService;

    public TripChecklistController(TripChecklistService checklistService) {
        this.checklistService = checklistService;
    }

    @GetMapping
    public ApiResponse<ChecklistResponse> list(@AuthenticationPrincipal AuthUser user,
                                               @PathVariable Long tripId) {
        return ApiResponse.success(checklistService.list(user.id(), tripId));
    }

    @PostMapping
    public ApiResponse<ChecklistItemResponse> add(@AuthenticationPrincipal AuthUser user,
                                                  @PathVariable Long tripId,
                                                  @Valid @RequestBody SaveChecklistItemRequest request) {
        return ApiResponse.success(checklistService.add(user.id(), tripId, request), "준비물을 추가했습니다.");
    }

    @PutMapping("/{itemId}")
    public ApiResponse<ChecklistItemResponse> rename(@AuthenticationPrincipal AuthUser user,
                                                     @PathVariable Long tripId,
                                                     @PathVariable Long itemId,
                                                     @Valid @RequestBody SaveChecklistItemRequest request) {
        return ApiResponse.success(checklistService.rename(user.id(), tripId, itemId, request),
                "준비물을 수정했습니다.");
    }

    @PostMapping("/{itemId}/toggle")
    public ApiResponse<ChecklistItemResponse> toggle(@AuthenticationPrincipal AuthUser user,
                                                     @PathVariable Long tripId,
                                                     @PathVariable Long itemId) {
        return ApiResponse.success(checklistService.toggle(user.id(), tripId, itemId));
    }

    @DeleteMapping("/{itemId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user,
                                    @PathVariable Long tripId,
                                    @PathVariable Long itemId) {
        checklistService.delete(user.id(), tripId, itemId);
        return ApiResponse.success(null, "준비물을 삭제했습니다.");
    }
}
