package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.plan.UsageCounter;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 사람이 기다리는 호출(음식 사진·글 분석) — {@link GeminiClient#generateJsonWhileWaiting}.
 *
 * <p>예전엔 음식 분석이 백그라운드 정책(최대 4분, 폴백은 ≈144초 뒤)을 써서 1차 모델이 503 이면 앱이 2분에
 * 포기한 뒤에야 폴백이 돌았다(docs/meal-photo-slowness_2026-10-12.md #3·#4). 진짜 HTTP 스텁으로 본문과 횟수를 본다.
 */
class GeminiWaitingCallTest {

    /** 실제 운영 모델 이름 — 생각 끄기는 이름으로 판정하므로 스텁도 같은 이름을 쓴다 */
    private static final String PRIMARY = "gemini-2.5-flash-lite";
    private static final String FALLBACK = "gemini-2.5-flash";

    private HttpServer server;
    private final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();
    private final Map<String, List<JsonNode>> bodies = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final PlanGuard planGuard = mock(PlanGuard.class);
    private final UsageCounter usageCounter = mock(UsageCounter.class);
    private final GeminiProperties properties = new GeminiProperties();
    private GeminiClient client;

    @FunctionalInterface
    private interface Responder {
        /** @return [상태코드, 본문] — n 은 이 모델이 받은 몇 번째 요청인지(1부터) */
        Object[] respond(String model, int n);
    }

    private void startServer(Responder responder) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String model = path.substring(path.lastIndexOf('/') + 1).replace(":generateContent", "");
            int n = hits.computeIfAbsent(model, k -> new AtomicInteger()).incrementAndGet();
            bodies.computeIfAbsent(model, k -> new CopyOnWriteArrayList<>())
                    .add(objectMapper.readTree(exchange.getRequestBody()));
            Object[] result = responder.respond(model, n);
            byte[] payload = ((String) result[1]).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders((int) result[0], payload.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(payload);
            }
        });
        server.start();
        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/models");
    }

    private static String okBody(String name) {
        return """
                {"candidates":[{"content":{"parts":[{"text":"{\\"name\\":\\"%s\\"}"}]}}]}
                """.formatted(name);
    }

    /** 퇴행 출력이 출력 상한에 잘린 모양 — JSON 이 닫히지 않았다 */
    private static final String BROKEN_BODY = """
            {"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"{\\"totalSugar\\": 0000000000"}]}}]}
            """;

    @BeforeEach
    void setUp() {
        properties.setApiKey("test-key");
        properties.setModel(PRIMARY);
        properties.setFallbackModel(FALLBACK);
        client = new GeminiClient(properties, objectMapper, planGuard, usageCounter,
                new SimpleMeterRegistry(), mock(AiUsageRecorder.class));
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    private JsonNode waiting() {
        return client.generateJsonWhileWaiting(1L, Feature.AI_FOOD_PHOTO,
                List.of(GeminiClient.textPart("김치찌개")), Map.of("type", "OBJECT"));
    }

    @Test
    void 일차_모델이_503이면_두_번만_묻고_바로_폴백한다() throws Exception {
        startServer((model, n) -> PRIMARY.equals(model)
                ? new Object[]{503, "{\"error\":\"overloaded\"}"}
                : new Object[]{200, okBody("김치찌개")});

        long start = System.currentTimeMillis();
        JsonNode result = waiting();
        long elapsed = System.currentTimeMillis() - start;

        assertThat(result.path("name").asText()).isEqualTo("김치찌개");
        assertThat(hits.get(PRIMARY).get()).isEqualTo(2);
        assertThat(hits.get(FALLBACK).get()).isEqualTo(1);
        // 백그라운드 정책이면 2→6→18→54초를 기다린 뒤였다. 여기선 0.7초 한 번
        assertThat(elapsed).isLessThan(5_000);
        verify(planGuard, never()).refund(1L, Feature.AI_FOOD_PHOTO);
    }

    @Test
    void 출력_상한을_싣고_생각_끄기는_폴백_모델에도_싣는다() throws Exception {
        startServer((model, n) -> PRIMARY.equals(model)
                ? new Object[]{503, "{\"error\":\"overloaded\"}"}
                : new Object[]{200, okBody("비빔밥")});

        waiting();

        JsonNode primaryConfig = bodies.get(PRIMARY).get(0).path("generationConfig");
        JsonNode fallbackConfig = bodies.get(FALLBACK).get(0).path("generationConfig");
        assertThat(primaryConfig.path("maxOutputTokens").asInt()).isEqualTo(2048);
        assertThat(fallbackConfig.path("maxOutputTokens").asInt()).isEqualTo(2048);
        // 폴백 2.5 Flash 는 생각이 기본으로 켜져 있어 넘어가는 순간 느려졌다
        assertThat(fallbackConfig.path("thinkingConfig").path("thinkingBudget").isInt()).isTrue();
        assertThat(fallbackConfig.path("thinkingConfig").path("thinkingBudget").asInt()).isZero();
        assertThat(primaryConfig.path("responseMimeType").asText()).isEqualTo("application/json");
    }

    @Test
    void 결과_JSON이_깨지면_폴백_모델에게_한_번_더_묻는다() throws Exception {
        startServer((model, n) -> PRIMARY.equals(model)
                ? new Object[]{200, BROKEN_BODY}
                : new Object[]{200, okBody("제육볶음")});

        JsonNode result = waiting();

        assertThat(result.path("name").asText()).isEqualTo("제육볶음");
        assertThat(hits.get(PRIMARY).get()).isEqualTo(1);
        assertThat(hits.get(FALLBACK).get()).isEqualTo(1);
        verify(planGuard, never()).refund(1L, Feature.AI_FOOD_PHOTO);
    }

    @Test
    void 다시_물어도_깨지면_실패하고_한도를_돌려준다() throws Exception {
        startServer((model, n) -> new Object[]{200, BROKEN_BODY});

        assertThatThrownBy(this::waiting)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_ANALYSIS_FAILED);

        // 한 번만 더 묻는다 — 503 재시도처럼 되풀이하지 않는다
        assertThat(hits.get(PRIMARY).get()).isEqualTo(1);
        assertThat(hits.get(FALLBACK).get()).isEqualTo(1);
        verify(planGuard).refund(1L, Feature.AI_FOOD_PHOTO);
    }

    /** 다른 기능(백그라운드 정책)의 요청 본문은 그대로다 — 상한·생각 끄기·깨진 JSON 재시도 없음 */
    @Test
    void 백그라운드_호출은_예전과_같다() throws Exception {
        startServer((model, n) -> new Object[]{200, BROKEN_BODY});

        assertThatThrownBy(() -> client.generateJsonInBackground(1L, Feature.AI_WEEKLY_LETTER,
                List.of(GeminiClient.textPart("안녕")), Map.of("type", "OBJECT")))
                .isInstanceOf(BusinessException.class);

        JsonNode config = bodies.get(PRIMARY).get(0).path("generationConfig");
        assertThat(config.has("maxOutputTokens")).isFalse();
        assertThat(config.has("thinkingConfig")).isFalse();
        assertThat(hits.get(FALLBACK)).isNull();
    }

    @Test
    void 생각_끄기는_2_5_Flash_계열에만() {
        assertThat(GeminiClient.supportsThinkingOff("gemini-2.5-flash")).isTrue();
        assertThat(GeminiClient.supportsThinkingOff("gemini-2.5-flash-lite")).isTrue();
        assertThat(GeminiClient.supportsThinkingOff("gemini-2.5-pro")).isFalse();
        assertThat(GeminiClient.supportsThinkingOff("gemini-3-flash")).isFalse();
        assertThat(GeminiClient.supportsThinkingOff(null)).isFalse();
    }
}
