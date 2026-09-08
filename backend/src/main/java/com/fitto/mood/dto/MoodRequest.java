package com.fitto.mood.dto;

import jakarta.validation.constraints.Size;

/**
 * 무드 설정 — 유니코드 이모지 하나이거나, 우리 이모지 하나다(둘 중 하나만).
 *
 * <p>{@code emoji} 는 12종 프리셋 중 하나지만 서버는 목록을 강제하지 않고 길이만 검증한다
 * (신뢰 경계 밖 — {@code MoodPack} 주석). {@code coupleEmojiId} 를 보내면 그쪽이 우선이고
 * {@code emoji} 는 서버가 감정에서 채우므로 보내지 않아도 된다.
 *
 * <p>그래서 {@code emoji} 에 {@code @NotBlank} 를 걸 수 없다 — "둘 중 하나"는 필드 하나로
 * 표현되지 않으므로 {@code MoodService.set} 에서 검증한다.
 */
public record MoodRequest(
        @Size(max = 10, message = "이모지 형식이 올바르지 않아요.")
        String emoji,
        /** 우리 이모지로 무드 걸기(V81) — 내 관계의, 숨기지 않은 것이어야 한다 */
        Long coupleEmojiId,
        @Size(max = 20, message = "메모는 20자 이내로 작성해주세요.")
        String message
) {
}
