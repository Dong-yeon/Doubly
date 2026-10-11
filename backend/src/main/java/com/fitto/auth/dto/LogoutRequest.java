package com.fitto.auth.dto;

import jakarta.validation.constraints.Size;

/**
 * 로그아웃 요청 본문 — 비어 있어도 된다(옛 앱은 본문 없이 부른다).
 *
 * @param pushToken 이 기기의 Expo 푸시 토큰. 주면 서버가 지워서 로그아웃한 기기로 그 계정 알림이
 *                  더 가지 않게 한다. 예전엔 리프레시 토큰만 폐기해서, 로그아웃한 폰에 채팅·상대 활동
 *                  알림이 미리보기 본문째로 계속 왔다(docs/my-current-state.md §7-4)
 */
public record LogoutRequest(
        @Size(max = 255) String pushToken
) {
}
