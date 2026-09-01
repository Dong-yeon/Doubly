package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.ai.GeminiClient;
import com.fitto.diet.dto.MealAnalysisResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * analyzeText/analyze 의 응답 매핑({@code toResponse}/{@code resolveSource}) — 스프링 컨텍스트
 * 없는 순수 단위 테스트. Gemini 응답은 {@link GeminiClient} 를 모킹해 흉내 낸다.
 * <p>
 * 회귀 방지: {@code source} 를 모델이 비우면(스키마상 required 아님 — FoodAnalysisTextPromptTest
 * 참고) {@code resolveSource} 가 호출부 기본값으로 채워야 하는데, {@code Set.of(...).contains(null)}
 * 이 false 대신 NullPointerException 을 던져 모든 텍스트 분석 요청이 500 으로 죽었었다.
 */
class FoodAnalysisResponseMappingTest {

    private final GeminiClient geminiClient = mock(GeminiClient.class);
    private final FoodAnalysisService service = new FoodAnalysisService(geminiClient);
    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode json(String s) throws Exception {
        return mapper.readTree(s);
    }

    @Test
    void source가_비어도_기본값으로_대체되고_예외를_던지지_않는다() throws Exception {
        JsonNode result = json("""
                {
                  "isFood": true,
                  "foods": [{"name": "계란", "calories": 70, "portion": "1개",
                             "carbs": 1, "protein": 6, "fat": 5}],
                  "totalCalories": 70, "totalCarbs": 1, "totalProtein": 6, "totalFat": 5
                }
                """);
        when(geminiClient.generateJsonInBackground(any(), any(), any(), any())).thenReturn(result);

        MealAnalysisResponse response = service.analyzeText(1L, "계란 하나");

        assertThat(response.source()).isEqualTo("TEXT_IN_PHOTO");
        assertThat(response.foods()).extracting("name").containsExactly("계란");
    }

    @Test
    void source가_스키마_밖_값이어도_기본값으로_대체된다() throws Exception {
        JsonNode result = json("""
                {
                  "isFood": true,
                  "foods": [{"name": "계란", "calories": 70, "portion": "1개",
                             "carbs": 1, "protein": 6, "fat": 5}],
                  "totalCalories": 70, "totalCarbs": 1, "totalProtein": 6, "totalFat": 5,
                  "source": "UNKNOWN_MADE_UP_VALUE"
                }
                """);
        when(geminiClient.generateJsonInBackground(any(), any(), any(), any())).thenReturn(result);

        MealAnalysisResponse response = service.analyzeText(1L, "계란 하나");

        assertThat(response.source()).isEqualTo("TEXT_IN_PHOTO");
    }

    @Test
    void source가_유효한_값이면_그대로_쓰인다() throws Exception {
        JsonNode result = json("""
                {
                  "isFood": true,
                  "foods": [{"name": "계란", "calories": 70, "portion": "1개",
                             "carbs": 1, "protein": 6, "fat": 5}],
                  "totalCalories": 70, "totalCarbs": 1, "totalProtein": 6, "totalFat": 5,
                  "source": "NUTRITION_LABEL"
                }
                """);
        when(geminiClient.generateJsonInBackground(any(), any(), any(), any())).thenReturn(result);

        MealAnalysisResponse response = service.analyzeText(1L, "계란 하나");

        assertThat(response.source()).isEqualTo("NUTRITION_LABEL");
    }
}
