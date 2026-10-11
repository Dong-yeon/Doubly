package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.service.GameNudgeService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * 게임 재촉 API — 종목 공통. docs/GAME_NUDGE_2026-09-30.md.
 *
 * <p>경로를 {@code /games/{id}/nudge} 가 아니라 {@code /games/nudge/{id}} 로 둔 이유: 종목별 컨트롤러가
 * {@code /games/omok/...}·{@code /games/puzzle/...} 처럼 두 번째 조각을 종목 이름으로 쓰므로, 같은 깊이의
 * 변수 경로와 겹치지 않게 앞 조각을 고정한다.
 */
@RestController
@RequestMapping("/api/v1/games/nudge")
public class GameNudgeController {

    private final GameNudgeService nudgeService;

    public GameNudgeController(GameNudgeService nudgeService) {
        this.nudgeService = nudgeService;
    }

    @PostMapping("/{gameId}")
    public ApiResponse<NudgeResponse> nudge(@AuthenticationPrincipal AuthUser user, @PathVariable Long gameId) {
        return ApiResponse.success(new NudgeResponse(nudgeService.nudge(user.id(), gameId)));
    }

    public record NudgeResponse(LocalDateTime nudgedAt) {
    }
}
