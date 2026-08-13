package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.plan.Quota;
import com.fitto.common.plan.UsageCounter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * Gemini API 공용 클라이언트 — 음식 사진 분석/운동 추천 등 AI 기능이 공유한다.
 *
 * <p><b>한도는 두 겹이다.</b>
 * <ol>
 *   <li><b>기능별 · 플랜별</b> 한도 — {@link PlanGuard}. 무료는 음식 사진 분석 하루 2회,
 *       PRO 는 30회처럼 기능마다 다르다. 숫자는 {@link Feature} 한 곳에 모여 있다</li>
 *   <li><b>사용자별 총량</b> 안전망 — {@code fitto.gemini.daily-limit-per-user}.
 *       Google AI Studio 무료 티어는 <b>프로젝트 단위</b> 일일 한도가 따로 있어서,
 *       기능별 한도를 아무리 잘 잡아도 사용자 수가 늘면 프로젝트 쿼터가 먼저 터지고
 *       <b>전원이</b> AI 를 못 쓴다. 플랜과 무관하게 이 상한을 함께 건다</li>
 * </ol>
 *
 * <p>카운터는 {@link UsageCounter}(Redis INCR, 미가용 시 인메모리 폴백)가 담당한다.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    private static final String GEMINI_ENDPOINT =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";

    private final GeminiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final PlanGuard planGuard;
    private final UsageCounter usageCounter;

    public GeminiClient(GeminiProperties properties, ObjectMapper objectMapper,
                        PlanGuard planGuard, UsageCounter usageCounter) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.planGuard = planGuard;
        this.usageCounter = usageCounter;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(60_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * AI 기능 사용 전 공통 관문 — 키 설정 확인 + 플랜 한도 차감 + 총량 안전망.
     *
     * <p>플랜 한도를 <b>먼저</b> 본다. 무료에서 막힌 기능이 총량 카운터를 갉아먹으면
     * 쓰지도 못한 기능 때문에 쓸 수 있는 기능의 잔여 횟수가 줄어든다.
     */
    public void requireConfiguredAndCountUsage(Long userId, Feature feature) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.AI_NOT_CONFIGURED);
        }
        planGuard.consume(userId, feature);

        Quota backstop = Quota.perDay(properties.getDailyLimitPerUser());
        if (usageCounter.increment(userId, Feature.AI_TOTAL, backstop) > backstop.limit()) {
            throw new BusinessException(ErrorCode.AI_DAILY_LIMIT_EXCEEDED);
        }
    }

    /** parts(텍스트/이미지)를 보내 구조화 출력(JSON mode) 결과를 파싱해 반환 */
    public JsonNode generateJson(List<Map<String, Object>> parts, Map<String, Object> responseSchema) {
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", parts)),
                "generationConfig", Map.of(
                        "temperature", 0.2,
                        "responseMimeType", "application/json",
                        "responseSchema", responseSchema));

        JsonNode root = callWithRetry(body);

        String text = root == null ? null
                : root.path("candidates").path(0).path("content")
                        .path("parts").path(0).path("text").asText(null);
        if (text == null || text.isBlank()) {
            log.warn("Gemini 응답에 결과 텍스트 없음: {}", root);
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception e) {
            log.warn("Gemini 결과 JSON 파싱 실패: {}", text);
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
    }

    /**
     * Gemini 호출 — 일시적 과부하(503)는 무료 티어에서 흔하므로 짧은 백오프로 자동 재시도한다.
     * (Google 공식 가이드도 503 에 지수 백오프 재시도를 권장)
     */
    private JsonNode callWithRetry(Map<String, Object> body) {
        int maxAttempts = 3;
        long backoffMillis = 500;
        for (int attempt = 1; ; attempt++) {
            try {
                return restClient.post()
                        .uri(GEMINI_ENDPOINT.formatted(properties.getModel()))
                        .header("x-goog-api-key", properties.getApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(JsonNode.class);
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                if (status == 503 && attempt < maxAttempts) {
                    log.info("Gemini 일시 과부하(503) — {}ms 후 재시도 ({}/{})", backoffMillis, attempt, maxAttempts);
                    sleep(backoffMillis);
                    backoffMillis *= 3;
                    continue;
                }
                log.warn("Gemini 호출 실패: status={} body={}", status, e.getResponseBodyAsString());
                throw new BusinessException(status == 429 || status == 503
                        ? ErrorCode.AI_RATE_LIMITED : ErrorCode.AI_ANALYSIS_FAILED);
            } catch (ResourceAccessException e) {
                log.warn("Gemini 호출 타임아웃/네트워크 오류: {}", e.getMessage());
                throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
            }
        }
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
    }

    public static Map<String, Object> textPart(String text) {
        return Map.of("text", text);
    }

    public static Map<String, Object> imagePart(String mimeType, byte[] bytes) {
        return Map.of("inlineData", Map.of(
                "mimeType", mimeType,
                "data", Base64.getEncoder().encodeToString(bytes)));
    }
}
