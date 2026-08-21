package com.fitto.call;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Stream 설정 여부 판정 — 스프링 컨텍스트 없는 순수 단위 테스트. */
class StreamTokenServiceTest {

    @Test
    void 키가_비어있으면_미설정으로_판정한다() {
        StreamTokenProperties properties = new StreamTokenProperties();
        StreamTokenService service = new StreamTokenService(properties);

        assertThat(service.isConfigured()).isFalse();
    }

    @Test
    void 키와_시크릿이_모두_있으면_설정된_것으로_판정하고_토큰을_서명한다() {
        StreamTokenProperties properties = new StreamTokenProperties();
        properties.setApiKey("key");
        properties.setApiSecret("secret-secret-secret-secret-secret-32b");
        StreamTokenService service = new StreamTokenService(properties);

        assertThat(service.isConfigured()).isTrue();
        assertThat(service.createToken(1L)).isNotBlank();
    }
}
