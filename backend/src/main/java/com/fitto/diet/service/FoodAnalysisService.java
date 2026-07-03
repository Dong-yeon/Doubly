package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.MealAnalysisResponse;
import com.fitto.diet.dto.MealAnalysisResponse.AnalyzedFood;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.URI;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 음식 사진 AI 분석 — Gemini API(무료 티어)로 사진 속 음식과 추정 칼로리를 식별한다.
 * <p>
 * 무료 티어 한도(프로젝트 단위 RPD)를 지키기 위해 사용자별 일일 횟수를 제한한다.
 * 카운터는 인메모리(단일 인스턴스 전제)라 재배포 시 리셋되지만, 남용 방지 목적으로는 충분하다.
 */
@Service
public class FoodAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(FoodAnalysisService.class);

    private static final String GEMINI_ENDPOINT =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";

    /** Cloudinary 업로드 결과만 허용 — 임의 URL 페치(SSRF) 방지 */
    private static final String ALLOWED_PHOTO_HOST_SUFFIX = "cloudinary.com";

    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;

    private static final String PROMPT = """
            사진 속 음식을 분석해 주세요.
            - 음식 사진이 아니면 isFood 를 false 로, foods 는 빈 배열로 응답합니다.
            - 각 음식의 이름(name)은 한국어로 적습니다. 한국 음식이면 정확한 한국어 명칭을 사용합니다.
            - calories 는 사진에 보이는 양 기준의 추정 칼로리(kcal), portion 은 대략적인 양(예: "1인분", "밥 반 공기")입니다.
            - totalCalories 는 모든 음식 칼로리의 합계입니다.
            - comment 에는 이 식단에 대한 짧고 다정한 한 줄 코멘트를 한국어로 작성합니다. (건강한 식단이면 칭찬, 아니면 부드러운 제안)
            """;

    /** Gemini 구조화 출력(JSON mode) 스키마 — 응답 파싱을 안정화한다 */
    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "isFood", Map.of("type", "BOOLEAN"),
                    "foods", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "name", Map.of("type", "STRING"),
                                            "calories", Map.of("type", "INTEGER"),
                                            "portion", Map.of("type", "STRING")),
                                    "required", List.of("name", "calories"))),
                    "totalCalories", Map.of("type", "INTEGER"),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("isFood", "foods", "totalCalories"));

    private final GeminiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    /** userId → 오늘 사용량 */
    private final ConcurrentHashMap<Long, DailyUsage> usageByUser = new ConcurrentHashMap<>();

    public FoodAnalysisService(GeminiProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(60_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public MealAnalysisResponse analyze(Long userId, String photoUrl) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.AI_NOT_CONFIGURED);
        }
        checkAndCountDailyUsage(userId);

        Image image = downloadImage(photoUrl);
        JsonNode result = callGemini(image);
        return toResponse(result);
    }

    // ---- 일일 사용량 제한 ----

    private void checkAndCountDailyUsage(Long userId) {
        LocalDate today = LocalDate.now();
        DailyUsage usage = usageByUser.compute(userId, (id, prev) ->
                (prev == null || !prev.date().equals(today)) ? new DailyUsage(today, new AtomicInteger()) : prev);
        if (usage.count().incrementAndGet() > properties.getDailyLimitPerUser()) {
            throw new BusinessException(ErrorCode.AI_DAILY_LIMIT_EXCEEDED);
        }
    }

    private record DailyUsage(LocalDate date, AtomicInteger count) {
    }

    // ---- 이미지 다운로드 (Cloudinary) ----

    private Image downloadImage(String photoUrl) {
        URI uri;
        try {
            uri = URI.create(photoUrl);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null
                || !(host.equals(ALLOWED_PHOTO_HOST_SUFFIX) || host.endsWith("." + ALLOWED_PHOTO_HOST_SUFFIX))) {
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }

        try {
            ResponseEntity<byte[]> entity = restClient.get().uri(uri).retrieve().toEntity(byte[].class);
            byte[] body = entity.getBody();
            if (body == null || body.length == 0 || body.length > MAX_IMAGE_BYTES) {
                throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
            }
            MediaType contentType = entity.getHeaders().getContentType();
            String mimeType = (contentType != null && "image".equals(contentType.getType()))
                    ? contentType.toString()
                    : MediaType.IMAGE_JPEG_VALUE;
            return new Image(body, mimeType);
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("식단 사진 다운로드 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }
    }

    private record Image(byte[] bytes, String mimeType) {
    }

    // ---- Gemini 호출 ----

    private JsonNode callGemini(Image image) {
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(
                        Map.of("inlineData", Map.of(
                                "mimeType", image.mimeType(),
                                "data", Base64.getEncoder().encodeToString(image.bytes()))),
                        Map.of("text", PROMPT)))),
                "generationConfig", Map.of(
                        "temperature", 0.2,
                        "responseMimeType", "application/json",
                        "responseSchema", RESPONSE_SCHEMA));

        try {
            return restClient.post()
                    .uri(GEMINI_ENDPOINT.formatted(properties.getModel()))
                    .header("x-goog-api-key", properties.getApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException e) {
            log.warn("Gemini 호출 실패: status={} body={}", e.getStatusCode(), e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 429) {
                throw new BusinessException(ErrorCode.AI_RATE_LIMITED);
            }
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        } catch (ResourceAccessException e) {
            log.warn("Gemini 호출 타임아웃/네트워크 오류: {}", e.getMessage());
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
    }

    // ---- 응답 파싱 ----

    private MealAnalysisResponse toResponse(JsonNode geminiResponse) {
        String text = geminiResponse == null ? null
                : geminiResponse.path("candidates").path(0).path("content")
                        .path("parts").path(0).path("text").asText(null);
        if (text == null || text.isBlank()) {
            log.warn("Gemini 응답에 결과 텍스트 없음: {}", geminiResponse);
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }

        JsonNode result;
        try {
            result = objectMapper.readTree(text);
        } catch (Exception e) {
            log.warn("Gemini 결과 JSON 파싱 실패: {}", text);
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }

        if (!result.path("isFood").asBoolean(false)) {
            return MealAnalysisResponse.notFood();
        }

        List<AnalyzedFood> foods = new ArrayList<>();
        for (JsonNode food : result.path("foods")) {
            String name = food.path("name").asText("");
            if (name.isBlank()) continue;
            foods.add(new AnalyzedFood(
                    name,
                    Math.max(0, food.path("calories").asInt(0)),
                    food.path("portion").asText(null)));
        }
        if (foods.isEmpty()) {
            return MealAnalysisResponse.notFood();
        }

        int totalCalories = result.path("totalCalories").asInt(0);
        if (totalCalories <= 0) {
            totalCalories = foods.stream().mapToInt(AnalyzedFood::calories).sum();
        }
        String comment = result.path("comment").asText(null);
        return new MealAnalysisResponse(true, foods, totalCalories, comment);
    }
}
