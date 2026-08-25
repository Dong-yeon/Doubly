package com.fitto.call;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

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

    /**
     * 회귀 테스트 — signWith(key) 는 키 바이트 길이로 알고리즘을 자동 선택하는데(jjwt),
     * 64바이트(프로덕션 STREAM_API_SECRET 실제 길이)는 512비트 이상이라 HS512 로 올라간다.
     * Stream 은 키 길이와 무관하게 항상 HS256 만 받으므로, 짧은 테스트용 시크릿(HS256 구간)
     * 만으로는 이 버그가 드러나지 않는다 — 실제로 프로덕션에서 통화가 전량 실패했었다.
     */
    @Test
    void 시크릿_길이와_무관하게_항상_HS256으로_서명한다() throws Exception {
        String productionLengthSecret = "qaa9s8fvmmbcxdv39y7ge2hurep644wzj45j5hwmmcapj5c3sem95kn5hpjcqe77";
        assertThat(productionLengthSecret.getBytes(StandardCharsets.UTF_8)).hasSize(64);

        StreamTokenProperties properties = new StreamTokenProperties();
        properties.setApiKey("key");
        properties.setApiSecret(productionLengthSecret);
        StreamTokenService service = new StreamTokenService(properties);

        String token = service.createToken(1L);
        String headerJson = new String(
                Base64.getUrlDecoder().decode(token.split("\\.")[0]), StandardCharsets.UTF_8);
        Map<?, ?> header = new ObjectMapper().readValue(headerJson, Map.class);

        assertThat(header.get("alg")).isEqualTo("HS256");
    }
}
