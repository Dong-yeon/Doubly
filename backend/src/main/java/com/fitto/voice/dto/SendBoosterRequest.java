package com.fitto.voice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 운동 부스터 보내기 — 녹음은 앱이 Cloudinary 로 직접 올리고 결과 URL만 보낸다(음성 응원과 동일). */
public record SendBoosterRequest(
        @NotBlank(message = "녹음 파일 URL이 필요합니다.")
        String audioUrl,

        @Size(max = 100, message = "메모는 100자까지 쓸 수 있어요.")
        String message
) {
}
