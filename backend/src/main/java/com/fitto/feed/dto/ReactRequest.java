package com.fitto.feed.dto;

import com.fitto.common.validation.Emoji;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 이모지 반응 토글 — 같은 (post, user, emoji) 재요청 시 해제.
 *
 * <p>길이만 제한하면 임의의 짧은 문자열이 반응으로 저장된다({@code @Emoji} 추가 이유).
 * max 10 은 feed_reactions.emoji 컬럼 폭과 맞춘 값이라 넘기면 안 된다
 * — ZWJ 로 결합된 긴 이모지는 이 제한에서 걸러진다.
 */
public record ReactRequest(
        @NotBlank(message = "이모지를 선택해주세요.")
        @Size(max = 10, message = "지원하지 않는 이모지예요.")
        @Emoji
        String emoji
) {
}
