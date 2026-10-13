package com.fitto.coupleemoji.controller;

import com.fitto.common.ai.AiJobResponse;
import com.fitto.common.ai.AiJobService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.coupleemoji.dto.CoupleEmojiResponse;
import com.fitto.coupleemoji.dto.GenerateCoupleEmojiRequest;
import com.fitto.coupleemoji.service.CoupleEmojiService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 우리 이모지 API — docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §5-7 */
@RestController
@RequestMapping("/api/v1/couple-emojis")
public class CoupleEmojiController {

    private final CoupleEmojiService coupleEmojiService;
    private final AiJobService aiJobService;

    public CoupleEmojiController(CoupleEmojiService coupleEmojiService, AiJobService aiJobService) {
        this.coupleEmojiService = coupleEmojiService;
        this.aiJobService = aiJobService;
    }

    /** 원본 사진 업로드 서명 — 일반 {@code /uploads/signature} 와 달리 전용 폴더로 보낸다(서비스 주석). */
    @PostMapping("/upload-signature")
    public ApiResponse<UploadSignatureResponse> uploadSignature(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(coupleEmojiService.sourceUploadSignature(user.id()));
    }

    /**
     * 세트 생성 — 접수증(202 + jobId)을 돌려주고 앱은 {@code GET /ai/jobs/{jobId}} 로 결과를 가져간다
     * (다른 AI 기능과 같은 규칙). 6장이 약 1분 걸리므로 앱은 폴링 사이사이 {@link #list} 를 다시 불러
     * 칸을 하나씩 채운다.
     */
    @PostMapping("/generate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<AiJobResponse> generate(@AuthenticationPrincipal AuthUser user,
                                               @Valid @RequestBody GenerateCoupleEmojiRequest request) {
        String requestId = request.requestId();
        if (requestId != null) {
            // 같은 요청이 두 번 왔다 — 차감하지 않고 처음 접수한 작업을 돌려준다(DTO requestId 주석)
            var earlier = aiJobService.claimRequest(user.id(), JOB_LABEL, requestId, request.sourceImageUrl());
            if (earlier.isPresent()) {
                /*
                 * 앱은 누를 때마다 사진을 새로 올린다 — 두 번째 요청이 올린 원본은 아무 작업도 쓰지 않으니 여기서 치운다
                 * ("사진은 저장하지 않아요", §9). 같은 URL 이면 먼저 온 작업의 원본이라 건드리지 않는다.
                 */
                if (!request.sourceImageUrl().equals(earlier.get().payload())) {
                    coupleEmojiService.discardSource(request.sourceImageUrl());
                }
                if (earlier.get().pending()) {
                    throw new BusinessException(ErrorCode.AI_REQUEST_IN_PROGRESS);
                }
                return ApiResponse.success(new AiJobResponse(earlier.get().jobId()), "AI가 우리 이모지를 그리고 있어요.");
            }
        }
        CoupleEmojiService.GenerationTicket ticket;
        try {
            ticket = coupleEmojiService.prepare(user.id(), request);
        } catch (RuntimeException e) {
            // 거절(402·429·검증)은 차감 전이거나 되돌린 뒤다 — 같은 키로 다시 누를 수 있어야 한다
            if (requestId != null) aiJobService.releaseRequest(user.id(), JOB_LABEL, requestId);
            throw e;
        }
        // 큐 포화로 거절되면 이미 차감한 세트 한도와 올라간 원본을 되돌린다(서비스 abandon 주석)
        String jobId = aiJobService.submit(user.id(), JOB_LABEL,
                () -> coupleEmojiService.generate(ticket),
                () -> coupleEmojiService.abandon(ticket));
        if (requestId != null) aiJobService.bindRequest(user.id(), JOB_LABEL, requestId, jobId, request.sourceImageUrl());
        return ApiResponse.success(new AiJobResponse(jobId), "AI가 우리 이모지를 그리고 있어요.");
    }

    private static final String JOB_LABEL = "couple-emoji";

    @GetMapping
    public ApiResponse<List<CoupleEmojiResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(coupleEmojiService.list(user.id()));
    }

    /** 무드 선택지에 올릴지 — 트레이에서 길게 눌러 토글한다 */
    @PatchMapping("/{emojiId}/mood-visible")
    public ApiResponse<CoupleEmojiResponse> setMoodVisible(@AuthenticationPrincipal AuthUser user,
                                                          @PathVariable Long emojiId,
                                                          @RequestParam boolean visible) {
        CoupleEmojiResponse updated = coupleEmojiService.setMoodVisible(user.id(), emojiId, visible);
        return ApiResponse.success(updated, visible ? "무드 선택지에 올렸어요." : "무드 선택지에서 내렸어요.");
    }

    @DeleteMapping("/{emojiId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long emojiId) {
        coupleEmojiService.delete(user.id(), emojiId);
        return ApiResponse.success(null, "이모지를 지웠어요.");
    }

    @DeleteMapping("/batches/{batchId}")
    public ApiResponse<Void> deleteBatch(@AuthenticationPrincipal AuthUser user, @PathVariable String batchId) {
        coupleEmojiService.deleteBatch(user.id(), batchId);
        return ApiResponse.success(null, "세트를 지웠어요.");
    }
}
