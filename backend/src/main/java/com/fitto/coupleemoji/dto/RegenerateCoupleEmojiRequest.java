package com.fitto.coupleemoji.dto;

import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * POST /api/v1/couple-emojis/batches/{batchId}/regenerate — 세트 안에서 한 장 다시 그리기.
 *
 * @param emotion   다시 그릴 감정. 세트에 살아 있으면 그 장을 대신하고, 없으면(만들다 실패한 칸) 채운다
 * @param requestId 같은 시도를 두 번 받지 않기 위한 키 — 생성과 같은 규칙({@link GenerateCoupleEmojiRequest})
 */
public record RegenerateCoupleEmojiRequest(
        @NotNull CoupleEmojiEmotion emotion,
        @Pattern(regexp = "[A-Za-z0-9_-]{8,64}", message = "요청 키 형식이 올바르지 않아요.") String requestId
) {
}
