package com.fitto.common.plan;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 스토어 상품 id 동기화 — 백엔드 {@link SubscriptionProducts}·{@link CreditProduct} ↔ 앱 {@code constants/config.ts}.
 *
 * <p>서버는 허용 목록에 없는 구독 상품이면 PRO 를 주지 않는다. 앱이 새 상품 id 로 결제를 열었는데 서버 목록에
 * 빠져 있으면 <b>돈은 나갔는데 PRO 가 안 붙는다</b> — 에러 없이 "반영 지연"으로만 보인다.
 * {@link PlanFeatureSyncTest} 와 같은 방식으로 앱 소스를 읽어 대조한다.
 */
class StoreProductIdSyncTest {

    private static final List<String> CONFIG_TS_CANDIDATES = List.of(
            "../frontend/src/constants/config.ts",
            "frontend/src/constants/config.ts");

    @Test
    void 앱의_구독_상품_id_가_서버_허용_목록과_같다() throws IOException {
        String source = readConfigTs();
        Set<String> frontend = new LinkedHashSet<>();
        frontend.add(single(source, "export const PRO_SUBSCRIPTION_SKU\\s*=\\s*'([a-z0-9_.]+)'"));
        Matcher block = Pattern.compile("export const PRO_SUBSCRIPTION_SKUS[^=]*=\\s*\\{([^}]+)}").matcher(source);
        assertThat(block.find()).as("config.ts 에서 PRO_SUBSCRIPTION_SKUS 를 찾지 못함").isTrue();
        Matcher literal = Pattern.compile("'([a-z0-9_.]+)'").matcher(block.group(1));
        while (literal.find()) {
            frontend.add(literal.group(1));
        }

        assertThat(frontend)
                .as("앱 PRO_SUBSCRIPTION_SKUS 와 서버 SubscriptionProducts.PRO 불일치")
                .containsExactlyInAnyOrderElementsOf(SubscriptionProducts.PRO);
    }

    @Test
    void 앱의_크레딧_상품_id_가_서버_CreditProduct_와_같다() throws IOException {
        String emojiSet = single(readConfigTs(), "export const EMOJI_SET_PRODUCT_ID\\s*=\\s*'([a-z0-9_.]+)'");
        Set<String> backend = Arrays.stream(CreditProduct.values())
                .map(CreditProduct::productId)
                .collect(Collectors.toSet());

        assertThat(backend).as("앱 EMOJI_SET_PRODUCT_ID 가 서버 CreditProduct 에 없음").contains(emojiSet);
    }

    private String single(String source, String regex) {
        Matcher m = Pattern.compile(regex).matcher(source);
        assertThat(m.find()).as("config.ts 에서 찾지 못함: " + regex).isTrue();
        return m.group(1);
    }

    private String readConfigTs() throws IOException {
        for (String candidate : CONFIG_TS_CANDIDATES) {
            Path p = Path.of(candidate);
            if (Files.exists(p)) {
                return Files.readString(p, StandardCharsets.UTF_8);
            }
        }
        throw new IllegalStateException("constants/config.ts 를 찾을 수 없습니다. 확인한 경로: " + CONFIG_TS_CANDIDATES
                + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }
}
