package com.fitto.coupleemoji.dto;

import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;

/**
 * POST /api/v1/couple-emojis/generate
 *
 * @param sourceImageUrl 앱이 {@code POST /couple-emojis/upload-signature} 로 받은 서명으로 올린 사진 URL.
 *                       전용 폴더에 올라간 것만 받는다 — 서버가 생성 뒤 원본을 지우기 때문에(§9) 아무 URL 이나
 *                       받으면 남의 사진을 지우는 경로가 된다.
 * @param subjectUserId  누구 얼굴인가 — 비우면 상대. 우리 둘 중 한 사람이어야 한다.
 * @param emotions       <b>이번에 그릴 감정</b>. <b>1개 이상, 한 번에
 *                       {@code CoupleEmojiService.MAX_EMOTIONS_PER_REQUEST}장까지</b>. 비워 보내면 거절한다 —
 *                       예전의 "비우면 전체"는 상한을 그냥 우회하는 구멍이라 없앴다.
 *                       <p>마음에 드는 장은 트레이에 그대로 두고 나머지만 다시 그리면, 그만큼만 돈과 시간이 든다.
 *                       <b>한도는 그대로 세트 1회 소비</b>다.
 * @param requestId      같은 요청을 두 번 받지 않기 위한 키(앱이 만들기를 누를 때 한 번 만든다). 같은 키가 다시 오면
 *                       차감하지 않고 처음 접수한 작업 id 를 돌려준다 — 더블탭·네트워크 재시도로 세트가 두 번
 *                       차감되던 구멍(docs/EMOJI_12_REGEN_2026-10-13.md §1-3). 옛 앱은 보내지 않는다(null 허용).
 * @param payWithCurrency 플랜 한도·첫 무료로 열리지 않으면 <b>유료 재화로 낸다</b> — 사용자가 "재화로 만들기"를 누른 것.
 *                       비거나 false 면 재화를 쓰지 않고 지금처럼 402 다(서버가 잔액을 보고 알아서 빼지 않는다).
 */
public record GenerateCoupleEmojiRequest(
        @NotBlank String sourceImageUrl,
        Long subjectUserId,
        List<CoupleEmojiEmotion> emotions,
        @Pattern(regexp = "[A-Za-z0-9_-]{8,64}", message = "요청 키 형식이 올바르지 않아요.") String requestId,
        Boolean payWithCurrency
) {
    /** 요청 키 없이 — 옛 앱과 테스트가 쓰는 모양. */
    public GenerateCoupleEmojiRequest(String sourceImageUrl, Long subjectUserId, List<CoupleEmojiEmotion> emotions) {
        this(sourceImageUrl, subjectUserId, emotions, null, null);
    }

    /** 요청 키만 — 재화를 쓰지 않는 앱(1.0.7 OTA 이후)의 모양. */
    public GenerateCoupleEmojiRequest(String sourceImageUrl, Long subjectUserId, List<CoupleEmojiEmotion> emotions,
                                      String requestId) {
        this(sourceImageUrl, subjectUserId, emotions, requestId, null);
    }
}
