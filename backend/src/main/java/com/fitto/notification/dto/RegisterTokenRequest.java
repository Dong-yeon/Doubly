package com.fitto.notification.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 디바이스 푸시 토큰 등록 요청.
 *
 * @param channelsVersion 앱이 이 기기에 만든 안드로이드 알림 채널 세트의 버전. 채널을 만들기 전 버전의 앱과
 *                        iOS 는 보내지 않는다(null) — 그런 기기엔 channelId 를 싣지 않는다.
 */
public record RegisterTokenRequest(
        @NotBlank(message = "토큰은 필수입니다.")
        String token,
        String platform,
        Integer channelsVersion
) {
}
