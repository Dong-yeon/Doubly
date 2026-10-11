package com.fitto.common.plan;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * userId ↔ appAccountToken 왕복.
 *
 * <p><b>문자열을 그대로 박아 둔다.</b> 앱({@code utils/iap.appAccountTokenOf})이 같은 규칙으로
 * 만드는데, 양쪽이 어긋나면 결제가 아무 계정에도 붙지 않고 증상은 "결제는 됐는데 PRO 가
 * 안 열림" 하나뿐이다 — 런타임에 알아채기 어려우니 여기서 형태를 고정한다.
 */
class AppAccountTokensTest {

    @Test
    void userId_는_UUID_하위비트에_들어간다() {
        assertThat(AppAccountTokens.of(1L)).isEqualTo("00000000-0000-0000-0000-000000000001");
        assertThat(AppAccountTokens.of(255L)).isEqualTo("00000000-0000-0000-0000-0000000000ff");
        assertThat(AppAccountTokens.of(123456789L)).isEqualTo("00000000-0000-0000-0000-0000075bcd15");
    }

    @Test
    void 되읽으면_원래_userId_다() {
        for (long id : new long[]{1L, 42L, 255L, 123456789L, 9_999_999_999L}) {
            assertThat(AppAccountTokens.userIdOf(AppAccountTokens.of(id))).isEqualTo(id);
        }
    }

    @Test
    void 우리가_만들지_않은_토큰은_거부한다() {
        // 상위 비트가 0 이 아니면 다른 데서 온 UUID 다 — 엉뚱한 사용자에 붙이면 안 된다.
        assertThat(AppAccountTokens.userIdOf("11111111-0000-0000-0000-000000000001")).isNull();
        assertThat(AppAccountTokens.userIdOf("not-a-uuid")).isNull();
        assertThat(AppAccountTokens.userIdOf("")).isNull();
        assertThat(AppAccountTokens.userIdOf(null)).isNull();
    }
}
