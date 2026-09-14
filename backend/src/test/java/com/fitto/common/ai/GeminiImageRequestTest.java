package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.plan.UsageCounter;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이미지 생성 경로의 토큰 적재 — 실제 HTTP 응답으로 본다.
 *
 * <p>이미지 생성은 <b>원가가 0이 아닌 유일한 AI 경로</b>다(텍스트는 무료 등급 키로 돈다).
 * 여기를 못 남기면 청구서를 받아도 어느 기능이 얼마를 썼는지 역산할 방법이 없다.
 */
class GeminiImageRequestTest {

    private static final String IMAGE_MODEL = "test-image-model";

    private HttpServer server;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GeminiProperties properties = new GeminiProperties();
    private final AiUsageLogRepository usageRepository = mock(AiUsageLogRepository.class);
    private final AiUsageRecorder usageRecorder =
            new AiUsageRecorder(usageRepository, new SimpleMeterRegistry());
    private GeminiClient client;

    /** 이미지 1장 + 토큰 사용량이 함께 오는 정상 응답 — data 는 바이트 {1,2,3} 의 base64 */
    private static final String OK_BODY = """
            {"candidates":[{"content":{"parts":[
               {"inlineData":{"mimeType":"image/png","data":"AQID"}}
            ]}}],
             "usageMetadata":{"promptTokenCount":270,"candidatesTokenCount":1290,
                              "thoughtsTokenCount":12,"cachedContentTokenCount":0,
                              "totalTokenCount":1572}}
            """;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            byte[] payload = OK_BODY.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, payload.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(payload);
            }
        });
        server.start();

        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/models");
        properties.setApiKey("test-key");
        properties.setImageModel(IMAGE_MODEL);
        client = new GeminiClient(properties, objectMapper, mock(PlanGuard.class),
                mock(UsageCounter.class), new SimpleMeterRegistry(), usageRecorder);
        when(usageRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    private void generate() {
        client.generateImageInBackground(7L, Feature.AI_COUPLE_EMOJI, List.of(
                GeminiClient.imagePart("image/jpeg", new byte[] {1, 2, 3}),
                GeminiClient.textPart("웃는 얼굴")));
    }

    @Test
    void 응답의_토큰_사용량을_적재한다() {
        generate();

        ArgumentCaptor<AiUsageLog> saved = ArgumentCaptor.forClass(AiUsageLog.class);
        verify(usageRepository).save(saved.capture());

        AiUsageLog log = saved.getValue();
        assertThat(log.getUserId()).isEqualTo(7L);
        assertThat(log.getFeatureCode()).isEqualTo(Feature.AI_COUPLE_EMOJI.name());
        assertThat(log.getModel()).isEqualTo(IMAGE_MODEL);
        assertThat(log.getPromptTokens()).isEqualTo(270);
        // 이미지 생성은 이 값이 곧 장당 원가다
        assertThat(log.getCandidatesTokens()).isEqualTo(1290);
        assertThat(log.getThoughtsTokens()).isEqualTo(12);
        assertThat(log.getTotalTokens()).isEqualTo(1572);
        // 보낸 이미지 파트 1장(얼굴 사진). 텍스트 파트는 세지 않는다
        assertThat(log.getImageCount()).isEqualTo(1);
        assertThat(log.getAttempt()).isEqualTo(1);
    }

    @Test
    void 적재가_실패해도_이미지_생성은_성공한다() {
        // 계측이 기능을 깨뜨리지 않는다 — AiUsageRecorder 의 유일한 불변식
        when(usageRepository.save(any())).thenThrow(new RuntimeException("DB 장애"));

        assertThat(client.generateImageInBackground(7L, Feature.AI_COUPLE_EMOJI, List.of(
                GeminiClient.textPart("웃는 얼굴"))).bytes()).containsExactly(1, 2, 3);
    }
}
