package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 음식 사진 AI 분석 — Gemini(무료 티어)로 사진 속 음식과 추정 칼로리를 식별한다.
 * 호출/한도 공통 처리는 {@link GeminiClient} 가 담당한다.
 */
@Service
public class FoodAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(FoodAnalysisService.class);

    /** Cloudinary 업로드 결과만 허용 — 임의 URL 페치(SSRF) 방지 */
    private static final String ALLOWED_PHOTO_HOST_SUFFIX = "cloudinary.com";

    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;

    private static final String PROMPT = """
            사진 속 음식을 분석해 주세요.
            - 음식 사진이 아니면 isFood 를 false 로, foods 는 빈 배열로 응답합니다.
            - 각 음식의 이름(name)은 한국어로 적습니다. 한국 음식이면 정확한 한국어 명칭을 사용합니다.
            - calories 는 사진에 보이는 양 기준의 추정 칼로리(kcal), portion 은 대략적인 양(예: "1인분", "밥 반 공기")입니다.
            - carbs/protein/fat 은 각 음식의 탄수화물/단백질/지방 추정량(그램, g)입니다.
            - totalCalories, totalCarbs, totalProtein, totalFat 은 모든 음식의 합계입니다.
            - comment 에는 이 식단에 대한 짧고 다정한 한 줄 코멘트를 한국어로 작성합니다. (영양 균형 관점에서 칭찬 또는 부드러운 제안)
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
                                            "portion", Map.of("type", "STRING"),
                                            "carbs", Map.of("type", "INTEGER"),
                                            "protein", Map.of("type", "INTEGER"),
                                            "fat", Map.of("type", "INTEGER")),
                                    "required", List.of("name", "calories"))),
                    "totalCalories", Map.of("type", "INTEGER"),
                    "totalCarbs", Map.of("type", "INTEGER"),
                    "totalProtein", Map.of("type", "INTEGER"),
                    "totalFat", Map.of("type", "INTEGER"),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("isFood", "foods", "totalCalories"));

    private final GeminiClient geminiClient;
    private final RestClient restClient;

    public FoodAnalysisService(GeminiClient geminiClient) {
        this.geminiClient = geminiClient;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(30_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public MealAnalysisResponse analyze(Long userId, String photoUrl) {
        geminiClient.requireConfiguredAndCountUsage(userId);

        Image image = downloadImage(photoUrl);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.imagePart(image.mimeType(), image.bytes()), GeminiClient.textPart(PROMPT)),
                RESPONSE_SCHEMA);
        return toResponse(result);
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
            String mimeType = resolveMimeType(body, entity.getHeaders().getContentType());
            return new Image(body, mimeType);
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("식단 사진 다운로드 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }
    }

    /**
     * 실제 이미지 포맷을 판별한다. Gemini 는 선언된 mimeType 과 실제 바이트가 일치하지 않으면
     * 거부하므로, CDN 이 보내는 Content-Type 헤더(누락되거나 부정확할 수 있음)를 그대로 믿지 않고
     * 파일 시그니처(매직 바이트)를 우선 사용한다.
     */
    private String resolveMimeType(byte[] body, MediaType headerContentType) {
        String sniffed = sniffImageMimeType(body);
        if (sniffed != null) {
            return sniffed;
        }
        if (headerContentType != null && "image".equals(headerContentType.getType())) {
            return headerContentType.getType() + "/" + headerContentType.getSubtype();
        }
        log.warn("이미지 포맷을 식별하지 못해 기본값(jpeg)으로 처리합니다. header={}", headerContentType);
        return MediaType.IMAGE_JPEG_VALUE;
    }

    /** 파일 시그니처로 이미지 포맷 판별 — Gemini 가 지원하는 포맷(PNG/JPEG/WEBP/HEIC/HEIF/GIF)만 확인 */
    private String sniffImageMimeType(byte[] b) {
        if (startsWith(b, 0xFF, 0xD8, 0xFF)) return MediaType.IMAGE_JPEG_VALUE;
        if (startsWith(b, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return MediaType.IMAGE_PNG_VALUE;
        if (startsWith(b, 0x47, 0x49, 0x46, 0x38)) return MediaType.IMAGE_GIF_VALUE;
        if (b.length >= 12 && startsWith(b, 0x52, 0x49, 0x46, 0x46) && matches(b, 8, 0x57, 0x45, 0x42, 0x50)) {
            return "image/webp";
        }
        if (b.length >= 12 && matches(b, 4, 0x66, 0x74, 0x79, 0x70)) { // "ftyp" box (HEIC/HEIF container)
            String brand = new String(b, 8, 4, java.nio.charset.StandardCharsets.US_ASCII);
            if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("hevc")
                    || brand.startsWith("hevx") || brand.startsWith("mif1") || brand.startsWith("msf1")) {
                return brand.startsWith("mif1") || brand.startsWith("msf1") ? "image/heif" : "image/heic";
            }
        }
        return null;
    }

    private boolean startsWith(byte[] b, int... signature) {
        return matches(b, 0, signature);
    }

    private boolean matches(byte[] b, int offset, int... signature) {
        if (b.length < offset + signature.length) return false;
        for (int i = 0; i < signature.length; i++) {
            if ((b[offset + i] & 0xFF) != signature[i]) return false;
        }
        return true;
    }

    private record Image(byte[] bytes, String mimeType) {
    }

    // ---- 응답 매핑 ----

    private MealAnalysisResponse toResponse(JsonNode result) {
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
                    food.path("portion").asText(null),
                    Math.max(0, food.path("carbs").asInt(0)),
                    Math.max(0, food.path("protein").asInt(0)),
                    Math.max(0, food.path("fat").asInt(0))));
        }
        if (foods.isEmpty()) {
            return MealAnalysisResponse.notFood();
        }

        int totalCalories = positiveOrSum(result, "totalCalories", foods, AnalyzedFood::calories);
        int totalCarbs = positiveOrSum(result, "totalCarbs", foods, AnalyzedFood::carbs);
        int totalProtein = positiveOrSum(result, "totalProtein", foods, AnalyzedFood::protein);
        int totalFat = positiveOrSum(result, "totalFat", foods, AnalyzedFood::fat);
        String comment = result.path("comment").asText(null);
        return new MealAnalysisResponse(true, foods, totalCalories, totalCarbs, totalProtein, totalFat, comment);
    }

    /** 합계 필드가 비었으면 개별 음식값을 합산해 보정한다. */
    private int positiveOrSum(JsonNode result, String field, List<AnalyzedFood> foods,
                              java.util.function.ToIntFunction<AnalyzedFood> extractor) {
        int total = result.path(field).asInt(0);
        return total > 0 ? total : foods.stream().mapToInt(extractor).sum();
    }
}
