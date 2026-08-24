package com.fitto.feed.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
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

    /**
     * 이모지 반응 토글 — 타임라인의 <b>모든</b> 카드(일상·운동·식단·맛집 방문)에 달 수 있다.
     * 같은 이모지를 다시 보내면 해제된다.
     */
    @PostMapping("/items/{type}/{refId}/reactions")
    public ApiResponse<List<ReactionSummary>> reactToItem(@AuthenticationPrincipal AuthUser user,
                                                          @PathVariable FeedItemType type,
                                                          @PathVariable Long refId,
                                                          @Valid @RequestBody ReactRequest request) {
        return ApiResponse.success(feedService.toggleReaction(user.id(), type, refId, request.emoji()));
    }

    /**
     * 일상 포스트 반응 — 위 경로의 {@code POST} 전용 별칭.
     * 앱이 오래 쓰던 경로라 남겨 둔다(구버전 앱이 설치된 기기에서 반응이 조용히 실패하지 않도록).
     */
    @PostMapping("/posts/{id}/reactions")
    public ApiResponse<List<ReactionSummary>> react(@AuthenticationPrincipal AuthUser user,
                                                    @PathVariable Long id,
                                                    @Valid @RequestBody ReactRequest request) {
        return ApiResponse.success(
                feedService.toggleReaction(user.id(), FeedItemType.POST, id, request.emoji()));
    }
}
