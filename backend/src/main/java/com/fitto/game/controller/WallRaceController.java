package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.PlaceWallRequest;
import com.fitto.game.dto.UndoResponseRequest;
import com.fitto.game.dto.WallRaceGameResponse;
import com.fitto.game.service.WallRaceService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 길막기 API — docs/PATH_LOCK_ANALYSIS_2026-09-21.md.
 *
 * <p>한 턴에 고를 수 있는 것이 둘(이동·벽)이라 경로도 둘이다. 어느 쪽이든 서버가 규칙으로
 * 거절할 수 있고, 거절 메시지는 그대로 사용자에게 보여도 되는 문장이다({@code ErrorCode}).
 */
@RestController
@RequestMapping("/api/v1/games/wall-race")
public class WallRaceController {

    private final WallRaceService wallRaceService;

    public WallRaceController(WallRaceService wallRaceService) {
        this.wallRaceService = wallRaceService;
    }

    /** 진행 중인 판 — 없으면 data: null */
    @GetMapping("/current")
    public ApiResponse<WallRaceGameResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(wallRaceService.current(user.id()));
    }

    @PostMapping
    public ApiResponse<WallRaceGameResponse> start(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(wallRaceService.start(user.id()));
    }

    /** 말 이동 — 갈 수 있는 자리는 응답의 legalMoves 가 알려준다 */
    @PutMapping("/{id}/pawn/{target}")
    public ApiResponse<WallRaceGameResponse> movePawn(@AuthenticationPrincipal AuthUser user,
                                                      @PathVariable Long id,
                                                      @PathVariable int target) {
        return ApiResponse.success(wallRaceService.movePawn(user.id(), id, target));
    }

    /** 벽 설치 — 겹치거나 길을 완전히 막으면 400 으로 돌아온다 */
    @PostMapping("/{id}/walls")
    public ApiResponse<WallRaceGameResponse> placeWall(@AuthenticationPrincipal AuthUser user,
                                                       @PathVariable Long id,
                                                       @Valid @RequestBody PlaceWallRequest req) {
        return ApiResponse.success(wallRaceService.placeWall(user.id(), id, req.slot(), req.kind()));
    }

    /** 무르기 요청 — 직전에 둔 사람만 걸 수 있다. 되돌리는 건 상대가 받아준 뒤. */
    @PostMapping("/{id}/undo-request")
    public ApiResponse<WallRaceGameResponse> requestUndo(@AuthenticationPrincipal AuthUser user,
                                                         @PathVariable Long id) {
        return ApiResponse.success(wallRaceService.requestUndo(user.id(), id), "무르기를 부탁했어요.");
    }

    /** 무르기 응답 — 받아주면 말은 제자리로, 벽은 손으로 돌아온다. */
    @PostMapping("/{id}/undo-response")
    public ApiResponse<WallRaceGameResponse> respondUndo(@AuthenticationPrincipal AuthUser user,
                                                         @PathVariable Long id,
                                                         @RequestBody UndoResponseRequest req) {
        WallRaceGameResponse game = wallRaceService.respondUndo(user.id(), id, req.accept());
        return ApiResponse.success(game, req.accept() ? "한 수 물렀어요." : "그냥 두기로 했어요.");
    }

    @PostMapping("/{id}/give-up")
    public ApiResponse<Void> giveUp(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        wallRaceService.giveUp(user.id(), id);
        return ApiResponse.success(null, "이 판은 접었어요.");
    }

    @GetMapping("/history")
    public ApiResponse<List<WallRaceGameResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(wallRaceService.history(user.id()));
    }
}
