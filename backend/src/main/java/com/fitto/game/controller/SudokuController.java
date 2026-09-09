package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.game.dto.SudokuMoveRequest;
import com.fitto.game.service.SudokuService;
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
 * 협동 스도쿠 API — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-4절.
 */
@RestController
@RequestMapping("/api/v1/games/sudoku")
public class SudokuController {

    private final SudokuService sudokuService;

    public SudokuController(SudokuService sudokuService) {
        this.sudokuService = sudokuService;
    }

    /** 진행 중인 판 — 없으면 data: null */
    @GetMapping("/current")
    public ApiResponse<SudokuGameResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(sudokuService.current(user.id()));
    }

    @PostMapping
    public ApiResponse<SudokuGameResponse> start(@AuthenticationPrincipal AuthUser user,
                                                 @Valid @RequestBody StartSudokuRequest request) {
        return ApiResponse.success(sudokuService.start(user.id(), request));
    }

    @PutMapping("/{id}/cells/{index}")
    public ApiResponse<SudokuGameResponse> move(@AuthenticationPrincipal AuthUser user,
                                                @PathVariable Long id,
                                                @PathVariable int index,
                                                @Valid @RequestBody SudokuMoveRequest request) {
        return ApiResponse.success(sudokuService.move(user.id(), id, index, request.value()));
    }

    @PostMapping("/{id}/give-up")
    public ApiResponse<Void> giveUp(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        sudokuService.giveUp(user.id(), id);
        return ApiResponse.success(null, "이 판은 접었어요.");
    }

    @GetMapping("/history")
    public ApiResponse<List<SudokuGameResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(sudokuService.history(user.id()));
    }
}
