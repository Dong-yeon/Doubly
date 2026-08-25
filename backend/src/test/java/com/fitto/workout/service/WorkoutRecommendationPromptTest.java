package com.fitto.workout.service;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 맞춤 프로그램 프롬프트 조립({@code buildProgramPrompt}) — 스프링 컨텍스트 없는 순수 단위 테스트.
 * <p>
 * 회귀 방지: {@code focusMuscleGroups}/{@code painAreas} 는 클라이언트 요청 바디의
 * {@code Set<String>} 을 그대로 받는다({@link com.fitto.workout.dto.RecommendWorkoutRequest} 는
 * 집합 크기만 검증하고 원소의 null 은 막지 않는다). JSON 배열에 {@code null} 원소가 섞이면
 * ({@code ["가슴", null]}) 역직렬화된 Set 에 null 이 그대로 들어오는데, 허용 목록이
 * {@code Set.of(...)} 불변 집합이라 {@code contains(null)} 이 false 대신 NPE 를 던져
 * /workout/recommend 요청 전체가 500 이 됐었다 (FoodAnalysisService.resolveSource 와 동일 버그).
 */
class WorkoutRecommendationPromptTest {

    // 프롬프트 조립만 검증하므로 협력자는 필요 없다
    private final WorkoutRecommendationService service = new WorkoutRecommendationService(null, null);

    @Test
    void 집중_부위에_null_원소가_섞여도_예외없이_나머지를_반영한다() {
        Set<String> focusMuscleGroups = new HashSet<>(Arrays.asList("가슴", null));

        assertThatCode(() -> service.buildProgramPrompt(
                List.of(DayOfWeek.MONDAY), focusMuscleGroups, null, null, null, ""))
                .doesNotThrowAnyException();

        String prompt = service.buildProgramPrompt(
                List.of(DayOfWeek.MONDAY), focusMuscleGroups, null, null, null, "");
        assertThat(prompt).contains("가슴");
    }

    @Test
    void 통증_부위에_null_원소가_섞여도_예외없이_나머지를_반영한다() {
        Set<String> painAreas = new HashSet<>(Arrays.asList("무릎", null));

        assertThatCode(() -> service.buildProgramPrompt(
                List.of(DayOfWeek.MONDAY), null, null, painAreas, null, ""))
                .doesNotThrowAnyException();

        String prompt = service.buildProgramPrompt(List.of(DayOfWeek.MONDAY), null, null, painAreas, null, "");
        assertThat(prompt).contains("무릎");
    }

    @Test
    void 둘_다_null_원소만_있으면_지시문_없이도_예외없이_조립된다() {
        Set<String> onlyNull = new HashSet<>(Arrays.asList((String) null));

        assertThatCode(() -> service.buildProgramPrompt(
                List.of(DayOfWeek.MONDAY), onlyNull, null, onlyNull, null, ""))
                .doesNotThrowAnyException();
    }
}
