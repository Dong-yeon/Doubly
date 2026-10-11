package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
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
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이미지 생성 요청의 <b>본문</b>과 토큰 적재 — 둘 다 "조용히 어긋나는" 종류라 실제 HTTP 로 본다.
 *
 * <p>이미지 생성은 <b>원가가 0이 아닌 유일한 AI 경로</b>다(텍스트는 무료 등급 키로 돈다).
 * 여기를 못 남기면 청구서를 받아도 어느 기능이 얼마를 썼는지 역산할 방법이 없다.
 *
 * <p><b>왜 굳이 본문을 들여다보나.</b> {@code imageSize} 는 빠져도 에러가 나지 않는다. 그냥 기본
 * 1K 로 생성되고 장당 단가가 0.045 → 0.067 USD 로 오를 뿐이다(세트 17장 기준 0.77 → 1.14 USD).
 * 결과물은 멀쩡해 보이므로 <b>청구서로만</b> 드러난다 — 테스트가 아니면 잡을 자리가 없다.
 */
class GeminiImageRequestTest {

    private static final String IMAGE_MODEL = "test-image-model";

    private HttpServer server;
    private final AtomicReference<JsonNode> lastRequest = new AtomicReference<>();

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
            lastRequest.set(objectMapper.readTree(exchange.getRequestBody()));
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

    private JsonNode imageConfig() {
        return lastRequest.get().path("generationConfig").path("imageConfig");
    }

    @Test
    void 해상도를_요청_본문에_실어_보낸다() {
        generate();

        // 512px 이 곧 장당 단가다 — 빠지면 기본 1K 로 생성돼 조용히 1.5배가 된다
        assertThat(imageConfig().path("imageSize").asText()).isEqualTo("512px");
    }

    @Test
    void 해상도가_비어_있으면_필드를_아예_보내지_않는다() {
        // 일부 모델·게이트웨이가 imageSize 를 400 으로 거절한다는 보고가 있어 남겨둔 탈출구.
        // 빈 문자열을 그대로 실어 보내면 그게 더 확실한 400 이므로, 필드 자체가 빠져야 한다.
        properties.setImageSize("");

        generate();

        assertThat(imageConfig().isMissingNode()).isTrue();
    }

    @Test
    void 비율은_지정하지_않는다() {
        generate();

        // 지금 그림체는 비율 미지정 상태로 실험해 확정한 것이다(COUPLE_EMOJI_AI_DESIGN §12).
        // 여기에 aspectRatio 가 생기면 원가가 아니라 결과물이 바뀐다.
        assertThat(imageConfig().has("aspectRatio")).isFalse();
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
