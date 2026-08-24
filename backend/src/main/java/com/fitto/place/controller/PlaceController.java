package com.fitto.place.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.place.dto.DateCourseResponse;
import com.fitto.place.dto.LovelichelinRecommendationResponse;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.PlaceSearchResponse;
import com.fitto.place.dto.PlaceVisitResponse;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.dto.UpdatePlaceRequest;
import com.fitto.place.service.DateCourseService;
import com.fitto.place.service.LovelichelinRecommendService;
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
import org.springframework.web.bind.annotation.RequestParam;
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
    private final LovelichelinRecommendService lovelichelinRecommendService;

    public PlaceController(PlaceService placeService, DateCourseService dateCourseService,
                           LovelichelinRecommendService lovelichelinRecommendService) {
        this.placeService = placeService;
        this.dateCourseService = dateCourseService;
        this.lovelichelinRecommendService = lovelichelinRecommendService;
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

    /**
     * AI 데이트 코스 추천 — 저장한 장소로 코스 구성 (GET /places/date-course)
     *
     * <p>{@code refresh=true} 는 사용자가 "다른 코스" 를 눌렀을 때만 붙인다. 화면 진입은
     * 캐시를 태워야 한다 — 무료 한도가 월 1회라 들어갈 때마다 새로 만들면 곧바로 소진된다.
     */
    @GetMapping("/date-course")
    public ApiResponse<DateCourseResponse> dateCourse(@AuthenticationPrincipal AuthUser user,
                                                      @RequestParam(defaultValue = "false") boolean refresh) {
        return ApiResponse.success(dateCourseService.recommend(user.id(), refresh));
    }

    /** AI 맛집 추천 — 럽슐랭 취향 분석(Gemini) + 카카오 실존 장소 검색 (GET /places/lovelichelin/recommendations) */
    @GetMapping("/lovelichelin/recommendations")
    public ApiResponse<LovelichelinRecommendationResponse> lovelichelinRecommend(
            @AuthenticationPrincipal AuthUser user,
            @RequestParam(defaultValue = "false") boolean refresh) {
        return ApiResponse.success(lovelichelinRecommendService.recommend(user.id(), refresh));
    }

    /**
     * 장소 이름 검색 — 카카오 로컬 키워드 검색 (GET /places/search). 식단 기록 화면의
     * "새 장소 추가" 진입점 — 결과를 그대로 {@link #save}(status=VISITED)에 넘기면
     * 좌표·주소가 채워진 장소가 방문완료로 바로 생긴다.
     */
    @GetMapping("/search")
    public ApiResponse<PlaceSearchResponse> search(@AuthenticationPrincipal AuthUser user,
                                                    @RequestParam String query,
                                                    @RequestParam(defaultValue = "8") int size) {
        return ApiResponse.success(placeService.search(query, size));
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
