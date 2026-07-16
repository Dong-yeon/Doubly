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
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
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
            - portion 과 carbs/protein/fat 은 반드시 채웁니다. 정확히 모르면 일반적인 값으로 추정하되,
              실제로 거의 없는 경우가 아니면 0 으로 두지 않습니다. (예: 계란은 지방이 0 이 아닙니다)
            - totalCalories, totalCarbs, totalProtein, totalFat 은 모든 음식의 합계입니다.
            - comment 에는 이 식단에 대한 짧고 다정한 한 줄 코멘트를 한국어로 작성합니다. (영양 균형 관점에서 칭찬 또는 부드러운 제안)
            """;

    /**
     * 텍스트로 적은 음식 분석 — 사진 분석과 같은 스키마로 응답받아 매핑을 공유한다.
     * 텍스트에 리터럴 % 를 쓰지 않는다 (formatted() 사용 시 이스케이프 필요).
     */
    private static final String TEXT_PROMPT = """
            아래는 사용자가 먹은 음식을 직접 적은 메모입니다. 이 메모를 분석해 주세요.

            - 음식이 아니거나 무엇을 먹었는지 알 수 없으면 isFood 를 false 로, foods 는 빈 배열로 응답합니다.
            - 쉼표·줄바꿈 등으로 나열된 음식을 각각 분리해 foods 에 담습니다. (예: "단백질쉐이크, 계란" → 2개)
            - 각 음식의 이름(name)은 메모의 표현을 존중하되 한국어 표준 명칭으로 다듬습니다.
            - 양이 적혀 있으면(예: "계란 2개", "밥 한 공기") 그 양을 반영하고, 없으면 한국인 기준
              일반적인 1인분으로 가정합니다. portion 에 **가정한 양을 반드시 적습니다**. (예: "1개", "1인분")
            - calories 는 그 양 기준 추정 칼로리(kcal), carbs/protein/fat 은 탄수화물/단백질/지방 추정량(g)입니다.
            - carbs/protein/fat 은 반드시 채웁니다. 정확히 모르면 일반적인 값으로 추정하되,
              실제로 거의 없는 경우가 아니면 0 으로 두지 않습니다. (예: 계란은 지방이 0 이 아닙니다)
            - totalCalories, totalCarbs, totalProtein, totalFat 은 모든 음식의 합계입니다.
            - comment 에는 이 식단에 대한 짧고 다정한 한 줄 코멘트를 한국어로 작성합니다.

            [메모]
            %s
            """;

    /**
     * Gemini 구조화 출력(JSON mode) 스키마 — 응답 파싱을 안정화한다.
     * <p>
     * portion·carbs·protein·fat 을 required 에 넣는 이유: 빼두면 모델이 그냥 생략해버리고,
     * 매핑에서 기본값 0 으로 채워져 "계란 지방 0g" 처럼 <b>모름이 0 으로 둔갑</b>한다.
     * 필수로 지정해야 모델이 실제 추정치를 채운다. (사진/텍스트 분석이 이 스키마를 공유)
     */
    static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
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
                                    "required", List.of("name", "calories", "portion",
                                            "carbs", "protein", "fat"))),
                    "totalCalories", Map.of("type", "INTEGER"),
                    "totalCarbs", Map.of("type", "INTEGER"),
                    "totalProtein", Map.of("type", "INTEGER"),
                    "totalFat", Map.of("type", "INTEGER"),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("isFood", "foods", "totalCalories",
                    "totalCarbs", "totalProtein", "totalFat"));

    private final GeminiClient geminiClient;
    private final RestClient restClient;

    public FoodAnalysisService(GeminiClient geminiClient) {
        this.geminiClient = geminiClient;
        // 리다이렉트 미추종 — 화이트리스트(cloudinary) 검증을 3xx 로 우회하는 SSRF 방지
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(30));
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

    /**
     * 텍스트 음식 분석 — 메모(예: "단백질쉐이크, 계란")로 칼로리·매크로를 추정한다.
     * 사진 분석과 스키마/매핑을 공유하므로 응답 형태가 같다.
     */
    public MealAnalysisResponse analyzeText(Long userId, String text) {
        geminiClient.requireConfiguredAndCountUsage(userId);

        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(buildTextPrompt(text))), RESPONSE_SCHEMA);
        return toResponse(result);
    }

    /** 프롬프트 조립 — 테스트에서 직접 검증하려고 package-private 로 둔다. */
    String buildTextPrompt(String text) {
        return TEXT_PROMPT.formatted(text.trim());
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
            // 전체 버퍼링 대신 스트리밍으로 상한+1 바이트까지만 읽는다 — 초대형 응답의 메모리 스파이크 방지.
            // 리다이렉트(3xx)는 팩토리에서 미추종이므로 2xx 가 아니면 전부 거부된다.
            // 실패 원인은 코드별로 분리해 어떤 문제인지 바로 보이게 한다.
            return restClient.get().uri(uri).exchange((request, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) {
                    throw new BusinessException(ErrorCode.PHOTO_DOWNLOAD_FAILED);
                }
                long declared = response.getHeaders().getContentLength();
                if (declared > MAX_IMAGE_BYTES) {
                    throw new BusinessException(ErrorCode.PHOTO_TOO_LARGE);
                }
                try (InputStream in = response.getBody()) {
                    byte[] body = in.readNBytes(MAX_IMAGE_BYTES + 1);
                    if (body.length == 0) {
                        throw new BusinessException(ErrorCode.PHOTO_DOWNLOAD_FAILED);
                    }
                    if (body.length > MAX_IMAGE_BYTES) {
                        throw new BusinessException(ErrorCode.PHOTO_TOO_LARGE);
                    }
                    String mimeType = resolveMimeType(body, response.getHeaders().getContentType());
                    return new Image(body, mimeType);
                }
            });
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("식단 사진 다운로드 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.PHOTO_DOWNLOAD_FAILED);
        }
    }

    /** Gemini 가 지원하는 이미지 MIME 화이트리스트 */
    private static final java.util.Set<String> SUPPORTED_MIME = java.util.Set.of(
            MediaType.IMAGE_JPEG_VALUE, MediaType.IMAGE_PNG_VALUE, MediaType.IMAGE_GIF_VALUE,
            "image/webp", "image/heic", "image/heif");

    /**
     * 실제 이미지 포맷을 판별한다. Gemini 는 선언된 mimeType 과 실제 바이트가 일치하지 않으면
     * 거부하므로, CDN 이 보내는 Content-Type 헤더(누락되거나 부정확할 수 있음)를 그대로 믿지 않고
     * 파일 시그니처(매직 바이트)를 우선 사용한다. 지원 포맷을 특정할 수 없으면 명확히 거부한다.
     */
    private String resolveMimeType(byte[] body, MediaType headerContentType) {
        String sniffed = sniffImageMimeType(body);
        if (sniffed != null) {
            return sniffed;
        }
        // 시그니처로 판별 못 하면, 헤더가 지원 포맷을 명시할 때만 신뢰
        if (headerContentType != null) {
            String type = headerContentType.getType() + "/" + headerContentType.getSubtype();
            if (SUPPORTED_MIME.contains(type)) {
                return type;
            }
        }
        log.warn("지원하지 않는 이미지 포맷. header={}", headerContentType);
        throw new BusinessException(ErrorCode.PHOTO_UNSUPPORTED_FORMAT);
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
