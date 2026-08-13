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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 기능 키 동기화 — 백엔드 {@link Feature} ↔ 프론트 {@code FeatureKey}.
 *
 * <p>서버가 내려주는 {@code features[].feature} 를 앱이 키로 쓴다. 한쪽에만 기능을
 * 추가하면 앱은 그 기능의 잠금 배지·잔여 횟수를 <b>조용히 표시하지 못한다</b> —
 * 에러가 나지 않아서 눈치채기까지 오래 걸린다. 약관 버전과 같은 이유로 여기서 대조한다
 * ({@code PolicyVersionSyncTest} 와 같은 패턴).
 */
class PlanFeatureSyncTest {

    // 테스트는 backend 모듈 디렉터리에서 실행된다 — 후보 경로로 types/index.ts 를 찾는다.
    private static final List<String> TYPES_TS_CANDIDATES = List.of(
            "../frontend/src/types/index.ts",
            "frontend/src/types/index.ts");

    @Test
    void 프론트_FeatureKey_와_백엔드_Feature_가_일치한다() throws IOException {
        Set<String> backend = Arrays.stream(Feature.values())
                .filter(feature -> feature != Feature.AI_TOTAL)   // 내부 안전망 — 앱에 내려가지 않는다
                .map(Enum::name)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        Set<String> frontend = parseFeatureKeys(readTypesTs());

        assertThat(frontend)
                .as("프론트 types/index.ts 의 FeatureKey 와 백엔드 Feature enum 불일치")
                .containsExactlyInAnyOrderElementsOf(backend);
    }

    private String readTypesTs() throws IOException {
        for (String candidate : TYPES_TS_CANDIDATES) {
            Path p = Path.of(candidate);
            if (Files.exists(p)) {
                return Files.readString(p, StandardCharsets.UTF_8);
            }
        }
        throw new IllegalStateException(
                "types/index.ts 를 찾을 수 없습니다. 확인한 경로: " + TYPES_TS_CANDIDATES
                        + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }

    /** {@code export type FeatureKey = | 'A' | 'B';} 에서 리터럴들을 뽑는다. */
    private Set<String> parseFeatureKeys(String source) {
        Matcher block = Pattern.compile("export type FeatureKey\\s*=([^;]+);").matcher(source);
        assertThat(block.find()).as("types/index.ts 에서 FeatureKey 선언을 찾지 못함").isTrue();

        Set<String> keys = new LinkedHashSet<>();
        Matcher literal = Pattern.compile("'([A-Z0-9_]+)'").matcher(block.group(1));
        while (literal.find()) {
            keys.add(literal.group(1));
        }
        return keys;
    }
}
