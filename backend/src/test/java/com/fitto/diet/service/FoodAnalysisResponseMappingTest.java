package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.plan.Feature;
import com.fitto.diet.dto.MealAnalysisResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
    private final FoodAnalysisService service = new FoodAnalysisService(geminiClient, null);
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
        when(geminiClient.generateJsonWhileWaiting(any(), any(), any(), any())).thenReturn(result);

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
        when(geminiClient.generateJsonWhileWaiting(any(), any(), any(), any())).thenReturn(result);

        MealAnalysisResponse response = service.analyzeText(1L, "계란 하나");

        assertThat(response.source()).isEqualTo("TEXT_IN_PHOTO");
    }

    /** 합계는 항목의 합이다 — 모델이 합계를 보내도(옛 스키마·환각) 쓰지 않는다 */
    @Test
    void 합계는_항목을_더한_값이고_모델이_보낸_합계는_무시한다() throws Exception {
        JsonNode result = json("""
                {
                  "isFood": true,
                  "foods": [
                    {"name": "연어초밥", "calories": 480, "portion": "14피스",
                     "carbs": 70, "protein": 30, "fat": 10, "sugar": 8, "sodium": 900, "fiber": 1},
                    {"name": "광어초밥", "calories": 280, "portion": "10피스",
                     "carbs": 50, "protein": 20, "fat": 3, "sugar": 6, "sodium": 700, "fiber": 1}
                  ],
                  "totalCalories": 9999, "totalSugar": 800000000
                }
                """);
        when(geminiClient.generateJsonWhileWaiting(any(), any(), any(), any())).thenReturn(result);

        MealAnalysisResponse response = service.analyzeText(1L, "초밥");

        assertThat(response.totalCalories()).isEqualTo(760);
        assertThat(response.totalCarbs()).isEqualTo(120);
        assertThat(response.totalSugar()).isEqualTo(14);
        assertThat(response.totalSodium()).isEqualTo(1600);
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
        when(geminiClient.generateJsonWhileWaiting(any(), any(), any(), any())).thenReturn(result);

        MealAnalysisResponse response = service.analyzeText(1L, "계란 하나");

        assertThat(response.source()).isEqualTo("NUTRITION_LABEL");
    }

    /**
     * 사진을 받지 못하면 한도를 돌려준다(LOVEBODY_REVIEW §3 A-5) — 차감 직후 다운로드가 실패하면 예전엔
     * Gemini 를 한 번도 못 부르고 AI_FOOD_PHOTO 만 깎였다. 여기선 Cloudinary 가 아닌 주소로
     * INVALID_PHOTO_URL 을 낸다(네트워크 없이 재현되는 다운로드 실패).
     */
    @Test
    void 사진을_받지_못하면_차감한_한도를_돌려주고_분석은_부르지_않는다() {
        assertThatThrownBy(() -> service.analyze(7L, "https://example.com/not-cloudinary.jpg", null))
                .isInstanceOf(BusinessException.class);

        var order = inOrder(geminiClient);
        order.verify(geminiClient).requireConfiguredAndCountUsage(7L, Feature.AI_FOOD_PHOTO);
        order.verify(geminiClient).refund(7L, Feature.AI_FOOD_PHOTO);
        verify(geminiClient, never()).generateJsonWhileWaiting(any(), any(), any(), any());
    }
}
