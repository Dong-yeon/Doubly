package com.fitto.feed.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedPhotosResponse;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.dto.MemoriesResponse;
import com.fitto.feed.dto.ReactRequest;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.service.FeedService;
import com.fitto.feed.service.MemoriesService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 커플 일상 피드 API — PLAN.md Couple Feed.
 */
@RestController
@RequestMapping("/api/v1/feed")
public class FeedController {

    private final FeedService feedService;
    private final MemoriesService memoriesService;

    public FeedController(FeedService feedService, MemoriesService memoriesService) {
        this.feedService = feedService;
        this.memoriesService = memoriesService;
    }

    @GetMapping
    public ApiResponse<FeedTimelineResponse> timeline(
            @AuthenticationPrincipal AuthUser user,
            // 커서는 서버가 만든 불투명 토큰 — 클라이언트는 받은 값을 그대로 되돌려준다
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.success(feedService.timeline(user.id(), cursor, limit));
    }

    /** 전체 사진첩 — 사진 있는 커플 포스트만 keyset 페이징으로 모아본다. */
    @GetMapping("/photos")
    public ApiResponse<FeedPhotosResponse> photos(
            @AuthenticationPrincipal AuthUser user,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int limit) {
        return ApiResponse.success(feedService.photos(user.id(), cursor, limit));
    }

    /**
     * 추억 리마인드 — 오늘과 같은 월·일의 1년 이상 전 기록 (PLAN.md Memories).
     *
     * <p>{@code on} 을 생략하면 오늘(KST). 추억이 없어도 빈 {@code groups} 로 200 을 준다
     * — 홈이 매일 물어보고 조용히 넘어가야 한다.
     */
    @GetMapping("/memories")
    public ApiResponse<MemoriesResponse> memories(
            @AuthenticationPrincipal AuthUser user,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate on) {
        return ApiResponse.success(memoriesService.memories(user.id(), on));
    }

    @PostMapping("/posts")
    public ApiResponse<FeedItemResponse> createPost(@AuthenticationPrincipal AuthUser user,
                                                    @Valid @RequestBody CreatePostRequest request) {
        return ApiResponse.success(feedService.createPost(user.id(), request), "일상이 기록되었습니다.");
    }

    @DeleteMapping("/posts/{id}")
    public ApiResponse<Void> deletePost(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        feedService.deletePost(user.id(), id);
        return ApiResponse.success(null, "포스트가 삭제되었습니다.");
    }

    @PostMapping("/posts/{id}/reactions")
    public ApiResponse<List<ReactionSummary>> react(@AuthenticationPrincipal AuthUser user,
                                                    @PathVariable Long id,
                                                    @Valid @RequestBody ReactRequest request) {
        return ApiResponse.success(feedService.toggleReaction(user.id(), id, request.emoji()));
    }
}
