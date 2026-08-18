package com.fitto.voice.controller;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.common.upload.CloudinaryProperties;
import com.fitto.common.upload.CloudinarySigner;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.voice.domain.VoicePhrase;
import com.fitto.voice.dto.PartnerVoiceClipsResponse;
import com.fitto.voice.dto.SaveVoiceClipRequest;
import com.fitto.voice.dto.VoiceClipResponse;
import com.fitto.voice.service.VoiceClipService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 커플 음성 응원 API — 애인이 녹음한 짧은 문구를 저장/조회하고, 운동 중 재생할
 * 상대방 클립을 내려준다.
 */
@RestController
@RequestMapping("/api/v1/voice-clips")
public class VoiceClipController {

    private final VoiceClipService voiceClipService;
    private final CloudinaryProperties cloudinaryProperties;

    public VoiceClipController(VoiceClipService voiceClipService, CloudinaryProperties cloudinaryProperties) {
        this.voiceClipService = voiceClipService;
        this.cloudinaryProperties = cloudinaryProperties;
    }

    /**
     * 녹음 업로드용 서명 — 사진과 같은 Cloudinary 계정을 쓰지만 별도 엔드포인트다.
     * 문구가 고정 3종이라 사용자당 최대 3행만 쌓이고 재녹음은 교체이지 누적이 아니므로,
     * 사진(UploadController)과 달리 업로드 한도를 걸지 않는다.
     */
    @PostMapping("/upload-signature")
    public ApiResponse<UploadSignatureResponse> uploadSignature() {
        if (!cloudinaryProperties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        return ApiResponse.success(CloudinarySigner.sign(cloudinaryProperties));
    }

    @GetMapping
    public ApiResponse<List<VoiceClipResponse>> mine(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(voiceClipService.mine(user.id()));
    }

    /** 상대방이 녹음해둔 클립 — 운동 세션 시작 시 받아 재생에 쓴다 */
    @GetMapping("/partner")
    public ApiResponse<PartnerVoiceClipsResponse> partner(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(voiceClipService.partnerClips(user.id()));
    }

    @PostMapping
    public ApiResponse<VoiceClipResponse> save(@AuthenticationPrincipal AuthUser user,
                                               @Valid @RequestBody SaveVoiceClipRequest request) {
        return ApiResponse.success(voiceClipService.save(user.id(), request), "저장했어요.");
    }

    @DeleteMapping("/{phrase}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable VoicePhrase phrase) {
        voiceClipService.delete(user.id(), phrase);
        return ApiResponse.success(null, "삭제했어요.");
    }
}
