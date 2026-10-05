package com.fitto.common.analytics;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
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
 * 클라이언트 이벤트 동기화 — 백엔드 {@link ClientAnalyticsEvent} ↔ 프론트 {@code api/analytics.ts} 의 {@code ClientAnalyticsEvent}.
 *
 * <p>서버는 모르는 이벤트 이름을 역직렬화 단계에서 400 으로 거절하고({@link LogEventRequest}), 앱은 실패를 조용히 삼킨다
 * (화면 동작에 영향을 주면 안 되므로). 그래서 한쪽에만 이벤트를 추가하면 <b>아무 오류 없이 데이터만 빠진다</b> —
 * 식단 기록 화면 기준선 계측(2026-10-05)을 붙이면서 같은 함정을 막으려고 만들었다({@code PlanFeatureSyncTest} 와 같은 패턴).
 *
 * <p>또 {@link AnalyticsEvent} 에 같은 이름의 상수가 있는지도 본다 — 서버 코드가 이벤트를 셀 때 그 상수를 쓴다.
 */
class ClientAnalyticsEventSyncTest {

    // 테스트는 backend 모듈 디렉터리에서 실행된다 — 후보 경로로 찾는다(build.gradle frontendSyncSources 에 등록돼 있다).
    private static final List<String> ANALYTICS_TS_CANDIDATES = List.of(
            "../frontend/src/api/analytics.ts",
            "frontend/src/api/analytics.ts");

    @Test
    void 프론트_이벤트_목록과_백엔드_enum_이_일치한다() throws IOException {
        Set<String> backend = Arrays.stream(ClientAnalyticsEvent.values())
                .map(Enum::name)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        assertThat(parseFrontendEvents(read()))
                .as("frontend/src/api/analytics.ts 의 ClientAnalyticsEvent 와 백엔드 enum 불일치")
                .containsExactlyInAnyOrderElementsOf(backend);
    }

    @Test
    void 모든_클라이언트_이벤트에_같은_이름의_서버_상수가_있다() {
        Set<String> constants = Arrays.stream(AnalyticsEvent.class.getDeclaredFields())
                .filter(f -> Modifier.isStatic(f.getModifiers()) && f.getType() == String.class)
                .map(this::valueOf)
                .collect(Collectors.toSet());

        for (ClientAnalyticsEvent event : ClientAnalyticsEvent.values()) {
            assertThat(constants).as("AnalyticsEvent 에 %s 상수가 없다", event.name()).contains(event.name());
        }
    }

    private String valueOf(Field f) {
        try {
            return (String) f.get(null);
        } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
        }
    }

    private String read() throws IOException {
        for (String candidate : ANALYTICS_TS_CANDIDATES) {
            Path p = Path.of(candidate);
            if (Files.exists(p)) {
                return Files.readString(p, StandardCharsets.UTF_8);
            }
        }
        throw new IllegalStateException("analytics.ts 를 찾을 수 없습니다. 확인한 경로: " + ANALYTICS_TS_CANDIDATES
                + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }

    /** {@code export type ClientAnalyticsEvent = | 'A' // 주석 | 'B';} 에서 리터럴만 뽑는다(주석 안 따옴표는 대문자 규칙으로 걸러진다). */
    private Set<String> parseFrontendEvents(String source) {
        Matcher block = Pattern.compile("export type ClientAnalyticsEvent\\s*=([^;]+);").matcher(source);
        assertThat(block.find()).as("analytics.ts 에서 ClientAnalyticsEvent 선언을 찾지 못함").isTrue();
        Set<String> events = new LinkedHashSet<>();
        Matcher literal = Pattern.compile("\\|\\s*'([A-Z0-9_]+)'").matcher(block.group(1));
        while (literal.find()) {
            events.add(literal.group(1));
        }
        return events;
    }
}
