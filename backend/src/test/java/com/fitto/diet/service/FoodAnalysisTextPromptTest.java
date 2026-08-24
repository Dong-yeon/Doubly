package com.fitto.diet.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 텍스트 음식 분석 프롬프트/스키마 — 스프링 컨텍스트 없는 순수 단위 테스트.
 * <p>
 * 회귀 방지: 프롬프트에 리터럴 % 를 이스케이프(%%)하지 않으면 formatted() 가
 * UnknownFormatConversionException 을 던져 500 이 된다 (AI 운동 추천에서 실제로 겪음).
 * 사용자 입력에 % 가 섞여도 안전해야 한다.
 */
class FoodAnalysisTextPromptTest {

    // 프롬프트 조립만 검증하므로 협력자는 필요 없다
    private final FoodAnalysisService service = new FoodAnalysisService(null);

    @Test
    void 메모가_프롬프트에_치환된다() {
        String prompt = service.buildTextPrompt("단백질쉐이크, 계란");

        assertThat(prompt).contains("단백질쉐이크, 계란");
        assertThat(prompt).contains("[메모]");
    }

    @Test
    void 프롬프트는_예외없이_조립된다() {
        assertThatCode(() -> service.buildTextPrompt("계란 2개")).doesNotThrowAnyException();
    }

    @Test
    void 사용자_입력의_퍼센트도_안전하게_처리된다() {
        // formatted() 의 인자로 들어가므로 포맷 지정자로 해석되지 않아야 한다
        assertThatCode(() -> service.buildTextPrompt("우유 100% 한 컵")).doesNotThrowAnyException();
        assertThat(service.buildTextPrompt("우유 100% 한 컵")).contains("우유 100% 한 컵");
    }

    @Test
    void 앞뒤_공백은_정리된다() {
        assertThat(service.buildTextPrompt("  계란  ")).contains("[메모]\n계란\n");
    }

    // ---- 응답 스키마 계약 ----

    /**
     * portion·탄단지가 required 에서 빠지면 모델이 생략하고, 매핑 기본값 0 때문에
     * "계란 지방 0g" 처럼 모름이 0 으로 둔갑한다 (실제로 겪음). 계약을 고정한다.
     */
    @Test
    @SuppressWarnings("unchecked")
    void 음식_항목은_양과_탄단지를_반드시_채우게_한다() {
        Map<String, Object> foods = (Map<String, Object>)
                ((Map<String, Object>) FoodAnalysisService.RESPONSE_SCHEMA.get("properties")).get("foods");
        Map<String, Object> items = (Map<String, Object>) foods.get("items");
        List<String> required = (List<String>) items.get("required");

        assertThat(required).contains("name", "calories", "portion", "carbs", "protein", "fat");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 합계도_반드시_채우게_한다() {
        List<String> required = (List<String>) FoodAnalysisService.RESPONSE_SCHEMA.get("required");

        assertThat(required).contains("isFood", "foods", "totalCalories",
                "totalCarbs", "totalProtein", "totalFat");
    }

    /**
     * box(사진 속 위치, box_2d 실측용)는 필드는 있어야 하지만 required 에는 없어야 한다.
     * required 로 두면 이미지가 없는 텍스트 분석(analyzeText)이 이 스키마를 그대로 공유하다가
     * 좌표를 지어내거나 스키마 위반으로 파싱이 깨진다.
     */
    @Test
    @SuppressWarnings("unchecked")
    void box는_필드는_있지만_필수는_아니다() {
        Map<String, Object> foods = (Map<String, Object>)
                ((Map<String, Object>) FoodAnalysisService.RESPONSE_SCHEMA.get("properties")).get("foods");
        Map<String, Object> items = (Map<String, Object>) foods.get("items");
        Map<String, Object> properties = (Map<String, Object>) items.get("properties");
        List<String> required = (List<String>) items.get("required");

        assertThat(properties).containsKey("box");
        assertThat(required).doesNotContain("box");
    }
}
