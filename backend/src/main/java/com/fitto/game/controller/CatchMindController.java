package com.fitto.game.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.game.dto.CatchMindResponse;
import com.fitto.game.dto.CatchMindWordsResponse;
import com.fitto.game.dto.GuessRequest;
import com.fitto.game.dto.GuessResultResponse;
import com.fitto.game.dto.StartCatchMindRequest;
import com.fitto.game.service.CatchMindService;
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
 * 캐치마인드 API — docs/CATCH_MIND_2026-09-14.md.
 * 그리기는 앱 안에서만 일어나므로, 서버 경로는 "다 그린 그림 제출"부터 시작한다.
 */
@RestController
@RequestMapping("/api/v1/games/catch-mind")
public class CatchMindController {

    private final CatchMindService catchMindService;

    public CatchMindController(CatchMindService catchMindService) {
        this.catchMindService = catchMindService;
    }

    /** 진행 중인 판 — 없으면 data: null */
    @GetMapping("/current")
    public ApiResponse<CatchMindResponse> current(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(catchMindService.current(user.id()));
    }

    /** 제시어 후보 셋 — 직접 입력해도 된다 */
    @GetMapping("/words")
    public ApiResponse<CatchMindWordsResponse> words(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(catchMindService.words(user.id()));
    }

    /**
     * 채팅 공유용 그림 PNG 업로드 서명 — 사진 한도를 소비하지 않는다
     * (이유는 {@code CatchMindService.shareUploadSignature} 주석).
     */
    @PostMapping("/upload-signature")
    public ApiResponse<UploadSignatureResponse> uploadSignature(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(catchMindService.shareUploadSignature(user.id()));
    }

    /** 그림 제출 = 판 시작 */
    @PostMapping
    public ApiResponse<CatchMindResponse> start(@AuthenticationPrincipal AuthUser user,
                                                @Valid @RequestBody StartCatchMindRequest request) {
        return ApiResponse.success(catchMindService.start(user.id(), request), "그림을 보냈어요!");
    }

    /** 정답 시도 — 횟수 제한 없음 */
    @PostMapping("/{id}/guess")
    public ApiResponse<GuessResultResponse> guess(@AuthenticationPrincipal AuthUser user,
                                                  @PathVariable Long id,
                                                  @Valid @RequestBody GuessRequest request) {
        return ApiResponse.success(catchMindService.guess(user.id(), id, request.answer()));
    }

    /** 초성 힌트 — 열어도 실패로 치지 않는다 */
    @PostMapping("/{id}/hint")
    public ApiResponse<CatchMindResponse> hint(@AuthenticationPrincipal AuthUser user,
                                               @PathVariable Long id) {
        return ApiResponse.success(catchMindService.revealHint(user.id(), id));
    }

    /** 포기·접기 — 기록에 남지 않고 정답이 상대에게 공개된다 */
    @PostMapping("/{id}/give-up")
    public ApiResponse<Void> giveUp(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        catchMindService.giveUp(user.id(), id);
        return ApiResponse.success(null, "이 판은 접었어요.");
    }

    /** 맞힌 판 최근 20개 */
    @GetMapping("/history")
    public ApiResponse<List<CatchMindResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(catchMindService.history(user.id()));
    }
}
