package com.fitto.challenge.controller;

import com.fitto.challenge.dto.ChallengeResponse;
import com.fitto.challenge.dto.CreateChallengeRequest;
import com.fitto.challenge.service.CoupleChallengeService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 커플 챌린지/대결 API.
 */
@RestController
@RequestMapping("/api/v1/challenges")
public class CoupleChallengeController {

    private final CoupleChallengeService challengeService;

    public CoupleChallengeController(CoupleChallengeService challengeService) {
        this.challengeService = challengeService;
    }

    @GetMapping
    public ApiResponse<List<ChallengeResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(challengeService.list(user.id()));
    }

    @PostMapping
    public ApiResponse<ChallengeResponse> create(@AuthenticationPrincipal AuthUser user,
                                                 @Valid @RequestBody CreateChallengeRequest request) {
        return ApiResponse.success(challengeService.create(user.id(), request), "대결을 시작했어요!");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        challengeService.delete(user.id(), id);
        return ApiResponse.success(null, "대결을 삭제했어요.");
    }
}
