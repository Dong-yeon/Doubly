package com.fitto.feed.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.dto.ReactRequest;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.service.FeedService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 커플 일상 피드 API — PLAN.md Couple Feed.
 */
@RestController
@RequestMapping("/api/v1/feed")
public class FeedController {

    private final FeedService feedService;

    public FeedController(FeedService feedService) {
        this.feedService = feedService;
    }

    @GetMapping
    public ApiResponse<FeedTimelineResponse> timeline(
            @AuthenticationPrincipal AuthUser user,
            // 커서는 서버가 만든 불투명 토큰 — 클라이언트는 받은 값을 그대로 되돌려준다
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.success(feedService.timeline(user.id(), cursor, limit));
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
