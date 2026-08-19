package com.fitto.workout.service;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * AI 운동 추천 프롬프트 조립 — 스프링 컨텍스트 없이 순수 단위 테스트.
 * <p>
 * 회귀 방지: 프롬프트 텍스트에 리터럴 % 를 이스케이프(%%) 하지 않으면
 * {@code formatted()} 가 UnknownFormatConversionException 을 던져
 * AI 추천 전체가 500 으로 죽는다 (3c79da6 에서 실제로 발생).
 */
class WorkoutRecommendPromptTest {

    // 프롬프트 조립만 검증하므로 협력자는 필요 없다
    private final WorkoutRecommendationService service =
            new WorkoutRecommendationService(null, null);

    @Test
    void 프롬프트는_예외없이_조립된다() {
        assertThatCode(() -> service.buildPrompt(5, "(기록 없음)")).doesNotThrowAnyException();
        assertThatCode(() -> service.buildPrompt(1, "- 2026-07-15: 스쿼트[근력] 3x10 60kg"))
                .doesNotThrowAnyException();
    }

    @Test
    void 일수와_기록이_프롬프트에_치환된다() {
        String prompt = service.buildPrompt(5, "- 2026-07-15: 스쿼트[근력] 3x10 60kg");

        assertThat(prompt).contains("오늘부터 5일간의 운동 계획");
        assertThat(prompt).contains("총 5일을 빠짐없이 채웁니다");
        assertThat(prompt).contains("- 2026-07-15: 스쿼트[근력] 3x10 60kg");
    }

    @Test
    void 리터럴_퍼센트는_그대로_출력된다() {
        String prompt = service.buildPrompt(3, "(기록 없음)");

        // %% 로 이스케이프한 값이 최종 프롬프트에선 % 하나로 렌더링돼야 한다
        assertThat(prompt).contains("약 5~10%)");
        assertThat(prompt).doesNotContain("5~10%%");
    }

    // ---- 프로그램 모드(맞춤 프로그램 만들기) — 같은 %% 이스케이프 위험이 있는 별도 프롬프트 ----

    @Test
    void 프로그램_프롬프트는_예외없이_조립된다() {
        assertThatCode(() -> service.buildProgramPrompt(
                List.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY), "(기록 없음)"))
                .doesNotThrowAnyException();
    }

    @Test
    void 요일이_프로그램_프롬프트에_치환된다() {
        String prompt = service.buildProgramPrompt(
                List.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY), "(기록 없음)");

        assertThat(prompt).contains("매주 월요일, 수요일, 금요일 에 운동합니다");
        assertThat(prompt).contains("정확히 3개(월요일, 수요일, 금요일)");
    }

    @Test
    void 프로그램_프롬프트도_리터럴_퍼센트가_그대로_출력된다() {
        String prompt = service.buildProgramPrompt(List.of(DayOfWeek.MONDAY), "(기록 없음)");

        assertThat(prompt).contains("약 5~10%)");
        assertThat(prompt).doesNotContain("5~10%%");
    }
}
