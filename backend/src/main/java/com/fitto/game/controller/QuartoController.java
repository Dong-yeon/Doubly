package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.GameRecordResponse;
import com.fitto.game.dto.QuartoGameResponse;
import com.fitto.game.dto.QuartoMoveRequest;
import com.fitto.game.service.QuartoService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 넷이 같아 API — docs/game-current-state.md 11절. 경로의 {@code quarto} 는 내부 키다(사용자에게 보이지 않는다).
 *
 * <p>한 수는 {@code POST /{id}/moves} 하나다 — 놓기와 주기가 따로 오면 그 사이에 판이 반쯤 바뀐 상태가 생긴다.
 */
@RestController
@RequestMapping("/api/v1/games/quarto")
public class QuartoController {

    private final QuartoService quartoService;

    public QuartoController(QuartoService quartoService) {
        this.quartoService = quartoService;
    }

    /** 진행 중인 판 — 없으면 data: null */
    @GetMapping("/current")
    public ApiResponse<QuartoGameResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(quartoService.current(user.id()));
    }

    @PostMapping
    public ApiResponse<QuartoGameResponse> start(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(quartoService.start(user.id()));
    }

    /** 한 수 — 첫 수 {give} / 보통 {place, give} / 이기는 수·마지막 수 {place}. 같은 clientMoveId 는 재전송으로 본다 */
    @PostMapping("/{id}/moves")
    public ApiResponse<QuartoGameResponse> move(@AuthenticationPrincipal AuthUser user,
                                                @PathVariable Long id,
                                                @Valid @RequestBody QuartoMoveRequest req) {
        return ApiResponse.success(quartoService.move(user.id(), id, req));
    }

    @PostMapping("/{id}/give-up")
    public ApiResponse<Void> giveUp(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        quartoService.giveUp(user.id(), id);
        return ApiResponse.success(null, "이 판은 접었어요.");
    }

    /** 전적 — 끝낸 판 전부(무승부 포함) */
    @GetMapping("/record")
    public ApiResponse<GameRecordResponse> record(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(quartoService.record(user.id()));
    }

    /** 끝난 판 최근 20개 — 수 기록 포함 */
    @GetMapping("/history")
    public ApiResponse<List<QuartoGameResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(quartoService.history(user.id()));
    }
}
