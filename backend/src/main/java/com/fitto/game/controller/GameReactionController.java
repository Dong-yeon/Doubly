package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.domain.GameReaction;
import com.fitto.game.dto.GameReactionRequest;
import com.fitto.game.service.GameReactionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

/**
 * 게임 판 위 즉석 반응 API — docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 1절.
 */
@RestController
@RequestMapping("/api/v1/games/reactions")
public class GameReactionController {

    private final GameReactionService reactionService;

    public GameReactionController(GameReactionService reactionService) {
        this.reactionService = reactionService;
    }

    /** 보낼 수 있는 반응 목록 — 앱이 목록을 하드코딩하지 않도록 서버가 내려준다. */
    @GetMapping
    public ApiResponse<List<Item>> options() {
        return ApiResponse.success(Arrays.stream(GameReaction.values())
                .map(r -> new Item(r.name(), r.emoji(), r.label()))
                .toList());
    }

    /** 반응 보내기 — 연타로 걸러져도 200 이다(보낸 사람 화면은 이미 반응했다). */
    @PostMapping
    public ApiResponse<Void> send(@AuthenticationPrincipal AuthUser user,
                                  @Valid @RequestBody GameReactionRequest req) {
        reactionService.send(user.id(), req.gameType(), req.reaction());
        return ApiResponse.success(null);
    }

    public record Item(String key, String emoji, String label) {
    }
}
