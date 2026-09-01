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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 모델 폴백 — 1차 모델이 계속 503 이면 다른 모델에게 묻는다.
 *
 * <p>운영에서 관측된 Gemini 오류가 사실상 전부 503(모델 과부하)이라, 이 경로는 "있으면 좋은
 * 안전장치"가 아니라 <b>실패의 주된 출구</b>다. 그래서 진짜 HTTP 응답으로 검증한다 —
 * JDK 내장 {@link HttpServer} 를 띄워 모델 이름별로 다른 응답을 준다(구글은 부르지 않는다).
 */
class GeminiModelFallbackTest {

    private static final String PRIMARY = "model-busy";
    private static final String FALLBACK = "model-free";

    private HttpServer server;
    private final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();

    private final PlanGuard planGuard = mock(PlanGuard.class);
    private final UsageCounter usageCounter = mock(UsageCounter.class);
    private final GeminiProperties properties = new GeminiProperties();
    private GeminiClient client;

    /** 모델별 응답을 정하는 스텁 — path 에 모델 이름이 들어 있다. */
    @FunctionalInterface
    private interface Responder {
        /** @return [상태코드, 본문] */
        Object[] respond(String model);
    }

    private void startServer(Responder responder) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String model = path.substring(path.lastIndexOf('/') + 1).replace(":generateContent", "");
            hits.computeIfAbsent(model, k -> new AtomicInteger()).incrementAndGet();
            Object[] result = responder.respond(model);
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

    /** Gemini 성공 응답 모양 — 결과 텍스트는 JSON 문자열이다. */
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
        client = new GeminiClient(properties, new ObjectMapper(), planGuard, usageCounter, new SimpleMeterRegistry());
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    private JsonNode generate() {
        return client.generateJson(1L, Feature.AI_WEEKLY_LETTER,
                List.of(GeminiClient.textPart("안녕")), Map.of("type", "OBJECT"));
    }

    @Test
    void 일차_모델이_계속_503이면_폴백_모델이_답한다() throws Exception {
        startServer(model -> PRIMARY.equals(model)
                ? new Object[]{503, "{\"error\":\"overloaded\"}"}
                : new Object[]{200, okBody("폴백이 썼어요")});

        JsonNode result = generate();

        assertThat(result.path("letter").asText()).isEqualTo("폴백이 썼어요");
        assertThat(hits.get(PRIMARY).get()).isGreaterThan(1); // 1차는 재시도까지 하고 포기했다
        assertThat(hits.get(FALLBACK).get()).isEqualTo(1);
        // 결과를 받았으므로 한도를 되돌리면 안 된다
        verify(planGuard, never()).refund(1L, Feature.AI_WEEKLY_LETTER);
    }

    @Test
    void 일차_모델이_성공하면_폴백은_부르지_않는다() throws Exception {
        startServer(model -> new Object[]{200, okBody("1차가 썼어요")});

        assertThat(generate().path("letter").asText()).isEqualTo("1차가 썼어요");
        assertThat(hits.get(PRIMARY).get()).isEqualTo(1);
        assertThat(hits.get(FALLBACK)).isNull();
    }

    /*
     * 400 은 "우리 요청이 잘못됐다"는 뜻이라 모델을 바꿔도 똑같이 실패한다.
     * 여기서 폴백을 태우면 남은 예산만 태우고 사용자를 더 기다리게 할 뿐이다.
     */
    @Test
    void 요청_자체가_잘못된_실패에는_폴백하지_않는다() throws Exception {
        startServer(model -> new Object[]{400, "{\"error\":\"bad request\"}"});

        assertThatThrownBy(this::generate)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_ANALYSIS_FAILED);

        assertThat(hits.get(PRIMARY).get()).isEqualTo(1); // 재시도조차 하지 않는다
        assertThat(hits.get(FALLBACK)).isNull();
    }

    @Test
    void 둘_다_실패하면_한도를_되돌리고_실패로_올린다() throws Exception {
        startServer(model -> new Object[]{503, "{\"error\":\"overloaded\"}"});

        assertThatThrownBy(this::generate)
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_RATE_LIMITED);

        assertThat(hits.get(FALLBACK).get()).isGreaterThanOrEqualTo(1);
        verify(planGuard).refund(1L, Feature.AI_WEEKLY_LETTER);
    }

    @Test
    void 폴백이_설정되지_않았으면_일차_모델만_쓴다() throws Exception {
        properties.setFallbackModel("");
        startServer(model -> new Object[]{503, "{\"error\":\"overloaded\"}"});

        assertThatThrownBy(this::generate).isInstanceOf(BusinessException.class);

        assertThat(hits.get(FALLBACK)).isNull();
    }
}
