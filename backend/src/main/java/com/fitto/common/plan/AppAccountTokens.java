package com.fitto.common.plan;

import java.util.UUID;

/**
 * 우리 {@code userId} ↔ 애플 {@code appAccountToken} 변환.
 *
 * <p>애플은 구매에 실어 보낼 수 있는 사용자 식별자로 <b>UUID 하나만</b> 받는다
 * (구글의 {@code obfuscatedAccountId} 는 임의 문자열이라 userId 를 그대로 넣을 수 있었다).
 * 그래서 숫자 id 를 UUID 의 하위 64비트에 넣고 상위는 0 으로 둔다 — 되읽기가 자명하고,
 * 매핑 테이블을 따로 두지 않아도 된다.
 *
 * <p>앱도 같은 규칙으로 만든다({@code utils/iap.ts} 의 {@code appAccountTokenOf}) —
 * 양쪽이 어긋나면 결제가 아무 계정에도 붙지 않으므로, 규칙을 바꿀 때는 반드시 함께 고친다.
 */
public final class AppAccountTokens {

    private AppAccountTokens() {
    }

    public static String of(Long userId) {
        return userId == null ? null : new UUID(0L, userId).toString();
    }

    /** UUID 문자열에서 userId 를 되읽는다. 우리 규칙으로 만든 값이 아니면 null. */
    public static Long userIdOf(String appAccountToken) {
        if (appAccountToken == null || appAccountToken.isBlank()) {
            return null;
        }
        try {
            UUID uuid = UUID.fromString(appAccountToken.trim());
            // 상위 64비트가 0 이 아니면 우리가 만든 토큰이 아니다 — 엉뚱한 사용자에 붙이지 않는다.
            return uuid.getMostSignificantBits() == 0L ? uuid.getLeastSignificantBits() : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
