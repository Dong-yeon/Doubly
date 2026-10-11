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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Gemini 가 <b>응답하지 않을 때</b>(읽기 타임아웃) — 재시도·폴백을 타야 한다.
 *
 * <p>운영에서 7일간 난 AI 실패 7건이 전부 이 경로였다(docs/server-stability-current-state.md §11-2).
 * POST 는 HttpURLConnection 이 상태 줄을 늦게 읽어서, 읽기 타임아웃이 {@code ResourceAccessException}
 * 이 아니라 {@code RestClientException("Error while extracting response … octet-stream")} 으로 온다.
 * 그래서 GeminiClient 의 재시도·폴백·지표를 전부 비켜 갔다. 이 테스트는 상태 줄을 보내지 않는
 * 진짜 서버로 그 모양을 그대로 재현한다.
 */
class GeminiReadTimeoutTest {

    private static final String PRIMARY = "model-stuck";
    private static final String FALLBACK = "model-free";
    /** 테스트용 읽기 타임아웃 — 운영 45초 대신 짧게 */
    private static final int READ_TIMEOUT_MILLIS = 300;
    /** 이만큼 붙잡고 있으면 클라이언트가 먼저 포기한다 */
    private static final long STALL_MILLIS = 1_500;

    private HttpServer server;
    private ExecutorService serverThreads;
    private final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();

    private final PlanGuard planGuard = mock(PlanGuard.class);
    private final UsageCounter usageCounter = mock(UsageCounter.class);
    private final GeminiProperties properties = new GeminiProperties();
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private GeminiClient client;

    /** 모델과 그 모델의 몇 번째 호출인지를 받아 응답을 정한다. null 이면 응답하지 않고 붙잡는다. */
    @FunctionalInterface
    private interface Responder {
        String respond(String model, int nth);
    }

    private void startServer(Responder responder) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // 붙잡힌 요청이 다른 모델의 요청까지 막지 않도록 — 기본 실행기는 스레드 하나다
        serverThreads = Executors.newCachedThreadPool();
        server.setExecutor(serverThreads);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String model = path.substring(path.lastIndexOf('/') + 1).replace(":generateContent", "");
            int nth = hits.computeIfAbsent(model, k -> new AtomicInteger()).incrementAndGet();
            exchange.getRequestBody().readAllBytes();
            String body = responder.respond(model, nth);
            if (body == null) {
                try {
                    Thread.sleep(STALL_MILLIS); // 상태 줄조차 보내지 않는다 — 운영에서 본 모양
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                exchange.close();
                return;
            }
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, payload.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(payload);
            }
        });
        server.start();
        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/models");
    }

    private static String okBody(String letter) {
        return """
                {"candidates":[{"content":{"parts":[{"text":"{\\"letter\\":\\"%s\\"}"}]}}]}
                """.formatted(letter);
    }

    @BeforeEach
    void setUp() {
        properties.setApiKey("test-key");
        properties.setModel(PRIMARY);
        properties.setFallbackModel(FALLBACK);
        client = new GeminiClient(properties, new ObjectMapper(), planGuard, usageCounter,
                meterRegistry, mock(AiUsageRecorder.class), READ_TIMEOUT_MILLIS);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
            serverThreads.shutdownNow();
        }
    }

    private JsonNode generate() {
        return client.generateJson(1L, Feature.AI_WEEKLY_LETTER,
                List.of(GeminiClient.textPart("안녕")), Map.of("type", "OBJECT"));
    }

    private double timeoutAttempts(String model) {
        var timer = meterRegistry.find("fitto.ai.gemini.call")
                .tag("model", model).tag("outcome", "timeout").timer();
        return timer == null ? 0 : timer.count();
    }

    /*
     * 응답이 없다는 건 "그 모델이 지금 붙잡혀 있다"는 뜻이다. 같은 모델에게 또 45초를 주면
     * 앱이 2분에 포기하기 전에 폴백까지 닿지 못한다 — 첫 타임아웃에서 바로 폴백으로 넘긴다.
     */
    @Test
    void 일차_모델이_응답하지_않으면_바로_폴백_모델이_답한다() throws Exception {
        startServer((model, nth) -> PRIMARY.equals(model) ? null : okBody("폴백이 썼어요"));

        JsonNode result = generate();

        assertThat(result.path("letter").asText()).isEqualTo("폴백이 썼어요");
        assertThat(hits.get(PRIMARY).get()).isEqualTo(1); // 붙잡힌 모델에 다시 묻지 않는다
        assertThat(hits.get(FALLBACK).get()).isEqualTo(1);
        assertThat(timeoutAttempts(PRIMARY)).isEqualTo(1); // 지표에 남는다 — 예전엔 안 보였다
        verify(planGuard, never()).refund(1L, Feature.AI_WEEKLY_LETTER);
    }

    @Test
    void 폴백이_없으면_같은_모델에게_다시_묻는다() throws Exception {
        properties.setFallbackModel("");
        startServer((model, nth) -> nth == 1 ? null : okBody("두 번째에 됐어요"));

        JsonNode result = generate();

        assertThat(result.path("letter").asText()).isEqualTo("두 번째에 됐어요");
        assertThat(hits.get(PRIMARY).get()).isEqualTo(2);
        assertThat(hits.get(FALLBACK)).isNull();
    }

    @Test
    void 둘_다_응답하지_않으면_분석_실패로_올리고_한도를_되돌린다() throws Exception {
        startServer((model, nth) -> null);

        assertThatThrownBy(this::generate)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_ANALYSIS_FAILED);

        assertThat(hits.get(FALLBACK).get()).isGreaterThanOrEqualTo(1);
        assertThat(timeoutAttempts(FALLBACK)).isGreaterThanOrEqualTo(1);
        verify(planGuard).refund(1L, Feature.AI_WEEKLY_LETTER);
    }
}
