package com.fitto.place.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.place.dto.DateCourseResponse;
import com.fitto.place.dto.LovelichelinSummaryResponse;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.PlaceVisitResponse;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.dto.UpdatePlaceRequest;
import com.fitto.place.service.DateCourseService;
import com.fitto.place.service.LovelichelinReviewService;
import com.fitto.place.service.PlaceService;
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
 * 커플 맛집 지도 API — PLAN.md Place Map.
 */
@RestController
@RequestMapping("/api/v1/places")
public class PlaceController {

    private final PlaceService placeService;
    private final DateCourseService dateCourseService;
    private final LovelichelinReviewService lovelichelinReviewService;

    public PlaceController(PlaceService placeService, DateCourseService dateCourseService,
                           LovelichelinReviewService lovelichelinReviewService) {
        this.placeService = placeService;
        this.dateCourseService = dateCourseService;
        this.lovelichelinReviewService = lovelichelinReviewService;
    }

    @PostMapping
    public ApiResponse<PlaceResponse> save(@AuthenticationPrincipal AuthUser user,
                                           @Valid @RequestBody SavePlaceRequest request) {
        return ApiResponse.success(placeService.save(user.id(), request), "장소가 등록되었습니다.");
    }

    @GetMapping
    public ApiResponse<List<PlaceResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(placeService.list(user.id()));
    }

    /** AI 데이트 코스 추천 — 저장한 장소로 코스 구성 (GET /places/date-course) */
    @GetMapping("/date-course")
    public ApiResponse<DateCourseResponse> dateCourse(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(dateCourseService.recommend(user.id()));
    }

    /** AI 럽슐랭 에디터 총평 — 인증된 장소로 커플 취향 총평 (GET /places/lovelichelin/summary) */
    @GetMapping("/lovelichelin/summary")
    public ApiResponse<LovelichelinSummaryResponse> lovelichelinSummary(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(lovelichelinReviewService.summary(user.id()));
    }

    @GetMapping("/{id}")
    public ApiResponse<PlaceResponse> get(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(placeService.get(user.id(), id));
    }

    @PutMapping("/{id}")
    public ApiResponse<PlaceResponse> update(@AuthenticationPrincipal AuthUser user,
                                             @PathVariable Long id,
                                             @Valid @RequestBody UpdatePlaceRequest request) {
        return ApiResponse.success(placeService.update(user.id(), id, request), "장소가 수정되었습니다.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        placeService.delete(user.id(), id);
        return ApiResponse.success(null, "장소가 삭제되었습니다.");
    }

    /** 럽슐랭 대표 평점 등록/수정 — 나의 평점을 매기고 등급을 재산정한다 */
    @PutMapping("/{id}/rating")
    public ApiResponse<PlaceResponse> rate(@AuthenticationPrincipal AuthUser user,
                                           @PathVariable Long id,
                                           @Valid @RequestBody RatePlaceRequest request) {
        return ApiResponse.success(placeService.rate(user.id(), id, request), "럽슐랭 평가가 저장되었습니다.");
    }

    @PostMapping("/{id}/visits")
    public ApiResponse<PlaceVisitResponse> recordVisit(@AuthenticationPrincipal AuthUser user,
                                                       @PathVariable Long id,
                                                       @Valid @RequestBody RecordVisitRequest request) {
        return ApiResponse.success(placeService.recordVisit(user.id(), id, request), "방문 기록이 저장되었습니다.");
    }

    @GetMapping("/{id}/visits")
    public ApiResponse<List<PlaceVisitResponse>> visits(@AuthenticationPrincipal AuthUser user,
                                                        @PathVariable Long id) {
        return ApiResponse.success(placeService.visits(user.id(), id));
    }

    @DeleteMapping("/{id}/visits/{visitId}")
    public ApiResponse<Void> deleteVisit(@AuthenticationPrincipal AuthUser user,
                                         @PathVariable Long id,
                                         @PathVariable Long visitId) {
        placeService.deleteVisit(user.id(), id, visitId);
        return ApiResponse.success(null, "방문 기록이 삭제되었습니다.");
    }
}
