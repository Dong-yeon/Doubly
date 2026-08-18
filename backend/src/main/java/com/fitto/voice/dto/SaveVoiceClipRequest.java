package com.fitto.voice.dto;

import com.fitto.voice.domain.VoicePhrase;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** 음성 응원 클립 저장 — 녹음은 앱이 Cloudinary 로 직접 올리고, 여기엔 결과 URL만 보낸다 */
public record SaveVoiceClipRequest(
        @NotNull(message = "문구를 선택해주세요.")
        VoicePhrase phrase,

        @NotBlank(message = "녹음 파일 URL이 필요합니다.")
        String audioUrl
) {
}
