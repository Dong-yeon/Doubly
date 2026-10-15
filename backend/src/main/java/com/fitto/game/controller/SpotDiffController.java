package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.game.dto.SpotDiffListResponse;
import com.fitto.game.dto.SpotHintResponse;
import com.fitto.game.dto.SpotPuzzleResponse;
import com.fitto.game.dto.SpotTapRequest;
import com.fitto.game.dto.SpotTapResponse;
import com.fitto.game.service.SpotDiffService;
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
 * 사진 틀린그림찾기 API — docs/spot-diff-design_2026-10-14.md.
 *
 * <p>정답은 어떤 응답에도 그대로 실리지 않는다. 판정은 {@code POST /{id}/taps} 가 서버에서 하고, 정답 전체는
 * 둘 다 끝냈거나 판이 닫힌 뒤 {@code result} 로만 나온다.
 */
@RestController
@RequestMapping("/api/v1/games/spot-diff")
public class SpotDiffController {

    private final SpotDiffService service;

    public SpotDiffController(SpotDiffService service) {
        this.service = service;
    }

    /** 최근 퍼즐 — 오늘 것이 없으면 이때 만들기 시작한다 */
    @GetMapping
    public ApiResponse<SpotDiffListResponse> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(service.list(user.id()));
    }

    /** 지난 결과 20판 */
    @GetMapping("/history")
    public ApiResponse<List<SpotPuzzleResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(service.history(user.id()));
    }

    /** 무제한 모드 — 다음 판 미리 만들기(일일 모드면 409) */
    @PostMapping("/next")
    public ApiResponse<Void> next(@AuthenticationPrincipal AuthUser user) {
        service.next(user.id());
        return ApiResponse.success(null);
    }

    @GetMapping("/{id}")
    public ApiResponse<SpotPuzzleResponse> get(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(service.get(user.id(), id));
    }

    /** 퍼즐 화면 열기 — 처음이면 서버가 시작 시각을 적는다 */
    @PostMapping("/{id}/open")
    public ApiResponse<SpotPuzzleResponse> open(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(service.open(user.id(), id));
    }

    @PostMapping("/{id}/taps")
    public ApiResponse<SpotTapResponse> tap(@AuthenticationPrincipal AuthUser user, @PathVariable Long id,
                                            @Valid @RequestBody SpotTapRequest req) {
        return ApiResponse.success(service.tap(user.id(), id, req));
    }

    @PostMapping("/{id}/hints")
    public ApiResponse<SpotHintResponse> hint(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(service.hint(user.id(), id));
    }
}
