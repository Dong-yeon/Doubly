package com.fitto.trip.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.trip.dto.AlbumPostResponse;
import com.fitto.trip.service.TripAlbumService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 커플 여행 앨범 API — PLAN.md Trip Album. 일상 피드 포스트를 여행에 담아 모아 본다.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/album")
public class TripAlbumController {

    private final TripAlbumService tripAlbumService;

    public TripAlbumController(TripAlbumService tripAlbumService) {
        this.tripAlbumService = tripAlbumService;
    }

    @GetMapping
    public ApiResponse<List<AlbumPostResponse>> list(@AuthenticationPrincipal AuthUser user,
                                                     @PathVariable Long tripId) {
        return ApiResponse.success(tripAlbumService.list(user.id(), tripId));
    }

    @GetMapping("/candidates")
    public ApiResponse<List<AlbumPostResponse>> candidates(@AuthenticationPrincipal AuthUser user,
                                                           @PathVariable Long tripId) {
        return ApiResponse.success(tripAlbumService.candidates(user.id(), tripId));
    }

    @PostMapping("/{postId}")
    public ApiResponse<Void> attach(@AuthenticationPrincipal AuthUser user,
                                    @PathVariable Long tripId,
                                    @PathVariable Long postId) {
        tripAlbumService.attach(user.id(), tripId, postId);
        return ApiResponse.success(null, "사진을 앨범에 담았습니다.");
    }

    @DeleteMapping("/{postId}")
    public ApiResponse<Void> detach(@AuthenticationPrincipal AuthUser user,
                                    @PathVariable Long tripId,
                                    @PathVariable Long postId) {
        tripAlbumService.detach(user.id(), tripId, postId);
        return ApiResponse.success(null, "사진을 앨범에서 뺐습니다.");
    }
}
