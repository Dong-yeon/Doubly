package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.FinishPuzzleBattleRequest;
import com.fitto.game.dto.PuzzleBattleResponse;
import com.fitto.game.service.PuzzleBattleService;
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
 * 연쇄 퍼즐 대전 API — docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md.
 * 수(手)는 여기로 오지 않는다({@link PuzzleBattleStompController}). 판을 열고, 결과를 내고, 접는다.
 */
@RestController
@RequestMapping("/api/v1/games/puzzle")
public class PuzzleBattleController {

    private final PuzzleBattleService battleService;

    public PuzzleBattleController(PuzzleBattleService battleService) {
        this.battleService = battleService;
    }

    /** 진행 중인 판 — 없으면 data: null */
    @GetMapping("/current")
    public ApiResponse<PuzzleBattleResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(battleService.current(user.id()));
    }

    /** 새 판 — 진행 중인 판이 있으면 그걸 돌려준다 */
    @PostMapping
    public ApiResponse<PuzzleBattleResponse> start(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(battleService.start(user.id()));
    }

    /** 내 결과 제출 — 한 판에 한 번 */
    @PostMapping("/{id}/finish")
    public ApiResponse<PuzzleBattleResponse> finish(@AuthenticationPrincipal AuthUser user,
                                                    @PathVariable Long id,
                                                    @Valid @RequestBody FinishPuzzleBattleRequest request) {
        return ApiResponse.success(battleService.finish(user.id(), id, request));
    }

    /** 접기 — 기록에 남지 않는다 */
    @PostMapping("/{id}/give-up")
    public ApiResponse<Void> giveUp(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        battleService.giveUp(user.id(), id);
        return ApiResponse.success(null, "이 판은 접었어요.");
    }

    /** 끝난 판 최근 20개 */
    @GetMapping("/history")
    public ApiResponse<List<PuzzleBattleResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(battleService.history(user.id()));
    }
}
