package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Gemini API 공용 클라이언트 — 음식 사진 분석/운동 추천 등 AI 기능이 공유한다.
 * <p>
 * 무료 티어 한도(프로젝트 단위 RPD)를 지키기 위해 사용자별 일일 횟수를 여기서 공통 제한한다
 * (AI 기능 전체가 한도를 공유). 카운터는 인메모리(단일 인스턴스 전제)라 재배포 시 리셋되지만,
 * 남용 방지 목적으로는 충분하다.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    private static final String GEMINI_ENDPOINT =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";

    private final GeminiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    /** userId → 오늘 사용량 */
    private final ConcurrentHashMap<Long, DailyUsage> usageByUser = new ConcurrentHashMap<>();

    public GeminiClient(GeminiProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(60_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /** AI 기능 사용 전 공통 관문 — 키 설정 확인 + 사용자별 일일 한도 차감 */
    public void requireConfiguredAndCountUsage(Long userId) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.AI_NOT_CONFIGURED);
        }
        LocalDate today = LocalDate.now();
        DailyUsage usage = usageByUser.compute(userId, (id, prev) ->
                (prev == null || !prev.date().equals(today)) ? new DailyUsage(today, new AtomicInteger()) : prev);
        if (usage.count().incrementAndGet() > properties.getDailyLimitPerUser()) {
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

        JsonNode root;
        try {
            root = restClient.post()
                    .uri(GEMINI_ENDPOINT.formatted(properties.getModel()))
                    .header("x-goog-api-key", properties.getApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException e) {
            log.warn("Gemini 호출 실패: status={} body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new BusinessException(e.getStatusCode().value() == 429
                    ? ErrorCode.AI_RATE_LIMITED : ErrorCode.AI_ANALYSIS_FAILED);
        } catch (ResourceAccessException e) {
            log.warn("Gemini 호출 타임아웃/네트워크 오류: {}", e.getMessage());
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }

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

    public static Map<String, Object> textPart(String text) {
        return Map.of("text", text);
    }

    public static Map<String, Object> imagePart(String mimeType, byte[] bytes) {
        return Map.of("inlineData", Map.of(
                "mimeType", mimeType,
                "data", Base64.getEncoder().encodeToString(bytes)));
    }

    private record DailyUsage(LocalDate date, AtomicInteger count) {
    }
}
