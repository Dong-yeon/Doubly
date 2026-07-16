package com.fitto.diet.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 텍스트 음식 분석 프롬프트 조립 — 스프링 컨텍스트 없는 순수 단위 테스트.
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
}
