package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.diet.dto.MealAnalysisResponse;
import com.fitto.diet.dto.MealAnalysisResponse.AnalyzedFood;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

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

    private static final String PROMPT = """
            사진을 분석해 음식 정보를 알려주세요. 사진은 다음 중 하나입니다 — 해당하는
            종류를 source 필드에 적습니다.
            - PHOTO_FOOD: 실제 음식이 담긴 사진입니다. 사진에 보이는 양을 기준으로 추정합니다.
            - TEXT_IN_PHOTO: 메뉴판·영수증·손글씨 메모처럼 음식 이름이 글자로 적힌 사진입니다
              (실제 음식은 안 보입니다). 적힌 이름으로 음식을 식별하고, 양이 안 적혀 있으면
              한국인 기준 일반적인 1인분으로 가정해 추정합니다.
            - NUTRITION_LABEL: 포장식품 등의 영양성분표가 찍힌 사진입니다. 표에 인쇄된 값을
              그대로 옮겨 적습니다(추정하지 않습니다).
            - 음식도 음식 관련 글자도 없으면 isFood 를 false 로, foods 는 빈 배열로 응답합니다
              (이때는 source 를 생략해도 됩니다).
            - 각 음식의 이름(name)은 한국어로 적습니다. 한국 음식이면 정확한 한국어 명칭을 사용합니다.
            - calories 는 (source 에 따라 추정 또는 표기) 칼로리(kcal), portion 은 대략적인 양
              (예: "1인분", "밥 반 공기")입니다.
            - carbs/protein/fat 은 각 음식의 탄수화물/단백질/지방(그램, g)입니다.
            - sugar/fiber 는 당류/식이섬유(그램, g), sodium 은 나트륨(밀리그램, mg)입니다.
            - portion 과 carbs/protein/fat/sugar/sodium/fiber 는 반드시 채웁니다. 정확히 모르면
              일반적인 값으로 추정하되, 실제로 거의 없는 경우가 아니면 0 으로 두지 않습니다.
              (예: 계란은 지방이 0 이 아니고, 흰쌀밥은 나트륨이 거의 0에 가깝습니다)
            - totalCalories, totalCarbs, totalProtein, totalFat, totalSugar, totalSodium, totalFiber
              는 모든 음식의 합계입니다.
            - box 에는 사진에서 그 음식이 있는 위치를 [yMin, xMin, yMax, xMax] 네 정수로 표시합니다.
              값은 사진 전체를 0~1000 으로 정규화한 좌표입니다(왼쪽 위가 0,0). source 가
              PHOTO_FOOD 일 때만 적고, 위치를 특정하기 어려우면 생략해도 됩니다.
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
            - sugar/fiber 는 당류/식이섬유 추정량(그램, g), sodium 은 나트륨 추정량(밀리그램, mg)입니다.
            - carbs/protein/fat/sugar/sodium/fiber 는 반드시 채웁니다. 정확히 모르면 일반적인 값으로
              추정하되, 실제로 거의 없는 경우가 아니면 0 으로 두지 않습니다. (예: 계란은 지방이 0 이 아닙니다)
            - totalCalories, totalCarbs, totalProtein, totalFat, totalSugar, totalSodium, totalFiber
              는 모든 음식의 합계입니다.
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
     *
     * <p>{@code box} 와 {@code source} 는 <b>required 에 넣지 않는다</b> — 텍스트 분석
     * (analyzeText)이 이 스키마를 그대로 공유하는데, 텍스트엔 이미지가 없어 위치를 낼 수 없고
     * source 의 세 갈래(사진/사진 속 글자/영양성분표) 분류도 의미가 없다. required 로 강제하면
     * 텍스트 분석이 값을 지어내거나(환각) 스키마 위반으로 파싱이 깨진다 — 모델이 비워도
     * {@link #resolveSource} 가 호출부(analyze/analyzeText)별 기본값으로 채운다.
     */
    static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "OBJECT",
            // 최상위 프로퍼티가 10쌍을 넘어(source 추가로) Map.of 한도를 넘겨 ofEntries 로 바꿨다
            "properties", Map.ofEntries(
                    Map.entry("isFood", Map.of("type", "BOOLEAN")),
                    Map.entry("foods", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.ofEntries(
                                            Map.entry("name", Map.of("type", "STRING")),
                                            Map.entry("calories", Map.of("type", "INTEGER")),
                                            Map.entry("portion", Map.of("type", "STRING")),
                                            Map.entry("carbs", Map.of("type", "INTEGER")),
                                            Map.entry("protein", Map.of("type", "INTEGER")),
                                            Map.entry("fat", Map.of("type", "INTEGER")),
                                            Map.entry("sugar", Map.of("type", "INTEGER")),
                                            Map.entry("sodium", Map.of("type", "INTEGER")),
                                            Map.entry("fiber", Map.of("type", "INTEGER")),
                                            // [yMin, xMin, yMax, xMax] — 0~1000 정규화 좌표. source=PHOTO_FOOD 일 때만
                                            Map.entry("box", Map.of(
                                                    "type", "ARRAY",
                                                    "items", Map.of("type", "INTEGER")))),
                                    "required", List.of("name", "calories", "portion",
                                            "carbs", "protein", "fat", "sugar", "sodium", "fiber")))),
                    // 사진의 종류 — 신뢰도 표현(추정치 vs 표기값)과 box 유무를 이걸로 가른다
                    Map.entry("source", Map.of(
                            "type", "STRING",
                            "enum", List.of("PHOTO_FOOD", "TEXT_IN_PHOTO", "NUTRITION_LABEL"))),
                    Map.entry("totalCalories", Map.of("type", "INTEGER")),
                    Map.entry("totalCarbs", Map.of("type", "INTEGER")),
                    Map.entry("totalProtein", Map.of("type", "INTEGER")),
                    Map.entry("totalFat", Map.of("type", "INTEGER")),
                    Map.entry("totalSugar", Map.of("type", "INTEGER")),
                    Map.entry("totalSodium", Map.of("type", "INTEGER")),
                    Map.entry("totalFiber", Map.of("type", "INTEGER")),
                    Map.entry("comment", Map.of("type", "STRING"))),
            "required", List.of("isFood", "foods", "totalCalories",
                    "totalCarbs", "totalProtein", "totalFat"));

    private static final java.util.Set<String> VALID_SOURCES =
            java.util.Set.of("PHOTO_FOOD", "TEXT_IN_PHOTO", "NUTRITION_LABEL");

    private final GeminiClient geminiClient;
    /** 설정 의존이 없어 직접 만든다 — 기존 생성자 시그니처(테스트가 {@code new FoodAnalysisService(null)})를 지키기 위해. */
    private final CloudinaryImageFetcher imageFetcher = new CloudinaryImageFetcher();

    public FoodAnalysisService(GeminiClient geminiClient) {
        this.geminiClient = geminiClient;
    }

    public MealAnalysisResponse analyze(Long userId, String photoUrl) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_FOOD_PHOTO);

        CloudinaryImageFetcher.Image image = imageFetcher.fetch(photoUrl);
        JsonNode result = geminiClient.generateJsonInBackground(userId, Feature.AI_FOOD_PHOTO,
                List.of(GeminiClient.imagePart(image.mimeType(), image.bytes()), GeminiClient.textPart(PROMPT)),
                RESPONSE_SCHEMA);
        return toResponse(result, "PHOTO_FOOD");
    }

    /**
     * 텍스트 음식 분석 — 메모(예: "단백질쉐이크, 계란")로 칼로리·매크로를 추정한다.
     * 사진 분석과 스키마/매핑을 공유하므로 응답 형태가 같다. source 는 이미지가 없으니
     * 항상 TEXT_IN_PHOTO(글자로 알아냄)로 고정한다.
     */
    public MealAnalysisResponse analyzeText(Long userId, String text) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_FOOD_TEXT);

        JsonNode result = geminiClient.generateJsonInBackground(userId, Feature.AI_FOOD_TEXT,
                List.of(GeminiClient.textPart(buildTextPrompt(text))), RESPONSE_SCHEMA);
        return toResponse(result, "TEXT_IN_PHOTO");
    }

    /** 프롬프트 조립 — 테스트에서 직접 검증하려고 package-private 로 둔다. */
    String buildTextPrompt(String text) {
        return TEXT_PROMPT.formatted(text.trim());
    }

    /**
     * 테스트 호환용 위임 — Cloudinary 변환 URL 조립은 {@link CloudinaryImageFetcher} 로 옮겼다
     * (우리 이모지와 공유). 기존 테스트({@code FoodAnalysisCloudinaryTransformTest})가 이 메서드를
     * 직접 부르므로 이름과 가시성을 유지한다.
     */
    URI withTransform(URI uri) {
        return imageFetcher.withTransform(uri);
    }

    // ---- 응답 매핑 ----

    /** @param defaultSource 모델이 source 를 비웠거나 알 수 없는 값을 보냈을 때 쓸 호출부별 기본값 */
    private MealAnalysisResponse toResponse(JsonNode result, String defaultSource) {
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
                    Math.max(0, food.path("fat").asInt(0)),
                    Math.max(0, food.path("sugar").asInt(0)),
                    Math.max(0, food.path("sodium").asInt(0)),
                    Math.max(0, food.path("fiber").asInt(0)),
                    readBox(food.path("box"))));
        }
        if (foods.isEmpty()) {
            return MealAnalysisResponse.notFood();
        }

        int totalCalories = positiveOrSum(result, "totalCalories", foods, AnalyzedFood::calories);
        int totalCarbs = positiveOrSum(result, "totalCarbs", foods, AnalyzedFood::carbs);
        int totalProtein = positiveOrSum(result, "totalProtein", foods, AnalyzedFood::protein);
        int totalFat = positiveOrSum(result, "totalFat", foods, AnalyzedFood::fat);
        int totalSugar = positiveOrSum(result, "totalSugar", foods, AnalyzedFood::sugar);
        int totalSodium = positiveOrSum(result, "totalSodium", foods, AnalyzedFood::sodium);
        int totalFiber = positiveOrSum(result, "totalFiber", foods, AnalyzedFood::fiber);
        String comment = result.path("comment").asText(null);
        String source = resolveSource(result, defaultSource);
        return new MealAnalysisResponse(true, foods, totalCalories, totalCarbs, totalProtein, totalFat,
                totalSugar, totalSodium, totalFiber, comment, source);
    }

    /** 모델이 비웠거나 스키마 밖 값을 보내면(환각) 호출부 기본값으로 대체한다. */
    private String resolveSource(JsonNode result, String defaultSource) {
        String source = result.path("source").asText(null);
        // VALID_SOURCES 는 Set.of(...) 불변 집합이라 contains(null) 이 false 대신 NPE 를 던진다 —
        // 모델이 source 를 비우는 흔한 케이스(바로 이 메서드가 처리하려던 그 상황)에서 요청 전체가 500 으로 죽었었다.
        return source != null && VALID_SOURCES.contains(source) ? source : defaultSource;
    }

    /** 합계 필드가 비었으면 개별 음식값을 합산해 보정한다. */
    private int positiveOrSum(JsonNode result, String field, List<AnalyzedFood> foods,
                              java.util.function.ToIntFunction<AnalyzedFood> extractor) {
        int total = result.path(field).asInt(0);
        return total > 0 ? total : foods.stream().mapToInt(extractor).sum();
    }

    /**
     * box_2d — [yMin, xMin, yMax, xMax] 정수 4개. 모델이 생략했거나(required 아님) 개수가
     * 안 맞으면(환각·부분 응답) null 로 버린다 — 반쪽짜리 좌표를 프론트에 흘려보내지 않는다.
     */
    private List<Integer> readBox(JsonNode boxNode) {
        if (!boxNode.isArray() || boxNode.size() != 4) {
            return null;
        }
        List<Integer> box = new ArrayList<>(4);
        for (JsonNode v : boxNode) {
            if (!v.isNumber()) {
                return null;
            }
            box.add(v.asInt());
        }
        return box;
    }
}
