package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.GamePieceResponse;
import com.fitto.game.dto.SetGamePieceRequest;
import com.fitto.game.service.GamePieceService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 게임 말 얼굴(우리 이모지) — 종목 공통. {@link GamePieceService} */
@RestController
@RequestMapping("/api/v1/games/pieces")
public class GamePieceController {

    private final GamePieceService pieceService;

    public GamePieceController(GamePieceService pieceService) {
        this.pieceService = pieceService;
    }

    @GetMapping
    public ApiResponse<GamePieceResponse> get(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(pieceService.get(user.id()));
    }

    @PutMapping
    public ApiResponse<GamePieceResponse> set(@AuthenticationPrincipal AuthUser user,
                                              @RequestBody SetGamePieceRequest request) {
        return ApiResponse.success(pieceService.set(user.id(), request.emojiId()));
    }
}
