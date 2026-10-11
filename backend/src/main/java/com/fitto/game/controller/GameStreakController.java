package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.GameStreakResponse;
import com.fitto.game.service.GameStreakService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 같이 게임한 날의 연속 기록 — 종목을 가리지 않으므로 스도쿠·오목 컨트롤러 어느 쪽도 아니다.
 * docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 3절.
 */
@RestController
@RequestMapping("/api/v1/games/streak")
public class GameStreakController {

    private final GameStreakService streakService;

    public GameStreakController(GameStreakService streakService) {
        this.streakService = streakService;
    }

    @GetMapping
    public ApiResponse<GameStreakResponse> streak(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(streakService.streak(user.id()));
    }
}
