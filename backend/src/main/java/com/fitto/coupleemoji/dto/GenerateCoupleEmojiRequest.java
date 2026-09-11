package com.fitto.coupleemoji.dto;

import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * POST /api/v1/couple-emojis/generate
 *
 * @param sourceImageUrl 앱이 {@code POST /couple-emojis/upload-signature} 로 받은 서명으로 올린 사진 URL.
 *                       전용 폴더에 올라간 것만 받는다 — 서버가 생성 뒤 원본을 지우기 때문에(§9) 아무 URL 이나
 *                       받으면 남의 사진을 지우는 경로가 된다.
 * @param subjectUserId  누구 얼굴인가 — 비우면 상대. 우리 둘 중 한 사람이어야 한다.
 * @param emotions       <b>이번에 그릴 감정</b>. <b>1개 이상, 한 번에 5장까지</b>
 *                       ({@code CoupleEmojiService.MAX_EMOTIONS_PER_REQUEST}). 비워 보내면 거절한다 —
 *                       예전의 "비우면 전체(17종)"는 상한을 그냥 우회하는 구멍이라 없앴다.
 *                       <p>감정이 17종이 되면서 "마음에 드는 몇 장 때문에 전체를 다시 뽑는" 일이 실제 비용이
 *                       됐다(장당 실비). 마음에 드는 장은 트레이에 그대로 두고 나머지만 다시 그리면, 그만큼만
 *                       돈과 시간이 든다. <b>한도는 그대로 세트 1회 소비</b>다 — 장 단위로 세면 계측이
 *                       복잡해지고, 어차피 상한을 두는 목적은 원가 방어인데 그건 장 수가 줄면 저절로 준다.
 */
public record GenerateCoupleEmojiRequest(
        @NotBlank String sourceImageUrl,
        Long subjectUserId,
        List<CoupleEmojiEmotion> emotions
) {
}
