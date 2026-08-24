package com.fitto.content.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.content.dto.ContentLogResponse;
import com.fitto.content.dto.ContentResponse;
import com.fitto.content.dto.RateContentRequest;
import com.fitto.content.dto.RecordContentLogRequest;
import com.fitto.content.dto.SaveContentRequest;
import com.fitto.content.dto.UpdateContentRequest;
import com.fitto.content.service.ContentService;
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
 * 커플 콘텐츠(영화·공연·드라마) API — {@link com.fitto.place.controller.PlaceController} 와
 * 같은 모양이나 검색·지도·AI 추천은 없다(제목 직접 입력 — PLAN.md 참고).
 */
@RestController
@RequestMapping("/api/v1/contents")
public class ContentController {

    private final ContentService contentService;

    public ContentController(ContentService contentService) {
        this.contentService = contentService;
    }

    @PostMapping
    public ApiResponse<ContentResponse> save(@AuthenticationPrincipal AuthUser user,
                                             @Valid @RequestBody SaveContentRequest request) {
        return ApiResponse.success(contentService.save(user.id(), request), "콘텐츠가 등록되었습니다.");
    }

    @GetMapping
    public ApiResponse<List<ContentResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(contentService.list(user.id()));
    }

    @GetMapping("/{id}")
    public ApiResponse<ContentResponse> get(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(contentService.get(user.id(), id));
    }

    @PutMapping("/{id}")
    public ApiResponse<ContentResponse> update(@AuthenticationPrincipal AuthUser user,
                                               @PathVariable Long id,
                                               @Valid @RequestBody UpdateContentRequest request) {
        return ApiResponse.success(contentService.update(user.id(), id, request), "콘텐츠가 수정되었습니다.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        contentService.delete(user.id(), id);
        return ApiResponse.success(null, "콘텐츠가 삭제되었습니다.");
    }

    /** 럽슐랭 대표 평점 등록/수정 — 나의 평점을 매기고 등급을 재산정한다 */
    @PutMapping("/{id}/rating")
    public ApiResponse<ContentResponse> rate(@AuthenticationPrincipal AuthUser user,
                                             @PathVariable Long id,
                                             @Valid @RequestBody RateContentRequest request) {
        return ApiResponse.success(contentService.rate(user.id(), id, request), "럽슐랭 평가가 저장되었습니다.");
    }

    @PostMapping("/{id}/logs")
    public ApiResponse<ContentLogResponse> recordLog(@AuthenticationPrincipal AuthUser user,
                                                      @PathVariable Long id,
                                                      @Valid @RequestBody RecordContentLogRequest request) {
        return ApiResponse.success(contentService.recordLog(user.id(), id, request), "관람 기록이 저장되었습니다.");
    }

    @GetMapping("/{id}/logs")
    public ApiResponse<List<ContentLogResponse>> logs(@AuthenticationPrincipal AuthUser user,
                                                       @PathVariable Long id) {
        return ApiResponse.success(contentService.logs(user.id(), id));
    }

    @DeleteMapping("/{id}/logs/{logId}")
    public ApiResponse<Void> deleteLog(@AuthenticationPrincipal AuthUser user,
                                       @PathVariable Long id,
                                       @PathVariable Long logId) {
        contentService.deleteLog(user.id(), id, logId);
        return ApiResponse.success(null, "관람 기록이 삭제되었습니다.");
    }
}
