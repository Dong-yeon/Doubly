package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.OmokGameResponse;
import com.fitto.game.dto.UndoResponseRequest;
import com.fitto.game.service.OmokService;
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
 * 오목 API — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절.
 */
@RestController
@RequestMapping("/api/v1/games/omok")
public class OmokController {

    private final OmokService omokService;

    public OmokController(OmokService omokService) {
        this.omokService = omokService;
    }

    /** 진행 중인 판 — 없으면 data: null */
    @GetMapping("/current")
    public ApiResponse<OmokGameResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(omokService.current(user.id()));
    }

    @PostMapping
    public ApiResponse<OmokGameResponse> start(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(omokService.start(user.id()));
    }

    @PutMapping("/{id}/cells/{index}")
    public ApiResponse<OmokGameResponse> place(@AuthenticationPrincipal AuthUser user,
                                               @PathVariable Long id,
                                               @PathVariable int index) {
        return ApiResponse.success(omokService.place(user.id(), id, index));
    }

    /** 무르기 요청 — 직전에 둔 사람만 걸 수 있다. 되돌리는 건 상대가 받아준 뒤. */
    @PostMapping("/{id}/undo-request")
    public ApiResponse<OmokGameResponse> requestUndo(@AuthenticationPrincipal AuthUser user,
                                                     @PathVariable Long id) {
        return ApiResponse.success(omokService.requestUndo(user.id(), id), "무르기를 부탁했어요.");
    }

    /** 무르기 응답 — 받아주면 마지막 수가 사라지고 차례가 되돌아간다. */
    @PostMapping("/{id}/undo-response")
    public ApiResponse<OmokGameResponse> respondUndo(@AuthenticationPrincipal AuthUser user,
                                                     @PathVariable Long id,
                                                     @RequestBody UndoResponseRequest req) {
        OmokGameResponse game = omokService.respondUndo(user.id(), id, req.accept());
        return ApiResponse.success(game, req.accept() ? "한 수 물렀어요." : "그냥 두기로 했어요.");
    }

    @PostMapping("/{id}/give-up")
    public ApiResponse<Void> giveUp(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        omokService.giveUp(user.id(), id);
        return ApiResponse.success(null, "이 판은 접었어요.");
    }

    @GetMapping("/history")
    public ApiResponse<List<OmokGameResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(omokService.history(user.id()));
    }
}
