package com.fitto.workout.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.workout.dto.WorkoutPhotoAnalysisResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 운동 인증샷 분석의 <b>응답 매핑</b> — Gemini 없이 JSON 만으로 검증한다
 * ({@code FoodAnalysisResponseMappingTest} 와 같은 방식).
 *
 * <p>여기서 지키려는 것은 <b>모델이 어설프게 채운 값이 그대로 기록이 되지 않는 것</b>이다.
 * 사용자는 이 값을 확인하고 저장하지만, 화면에 미리 채워진 숫자는 대개 그대로 저장된다 —
 * 0분·0km 나 앱이 모르는 카테고리가 통과하면 그게 곧 그 사람의 운동 기록이 된다.
 */
class WorkoutPhotoAnalysisMappingTest {

    private final WorkoutPhotoAnalysisService service = new WorkoutPhotoAnalysisService(null);
    private final ObjectMapper mapper = new ObjectMapper();

    private WorkoutPhotoAnalysisResponse map(String json) throws Exception {
        return service.toResponse(mapper.readTree(json));
    }

    @Test
    void 러닝앱_요약화면을_읽으면_시간과_거리가_담긴다() throws Exception {
        WorkoutPhotoAnalysisResponse result = map("""
                {"isWorkout": true, "exerciseName": "러닝", "category": "유산소",
                 "durationMin": 32, "distanceKm": 5.24, "calories": 310,
                 "sourceApp": "스트라바", "comment": "좋은 페이스예요!"}
                """);

        assertThat(result.isWorkout()).isTrue();
        assertThat(result.exerciseName()).isEqualTo("러닝");
        assertThat(result.category()).isEqualTo("유산소");
        assertThat(result.durationMin()).isEqualTo(32);
        assertThat(result.distanceKm()).isEqualByComparingTo("5.24");
        assertThat(result.sourceApp()).isEqualTo("스트라바");
    }

    @Test
    void 운동_사진이_아니면_전부_비운다() throws Exception {
        WorkoutPhotoAnalysisResponse result = map("""
                {"isWorkout": false, "exerciseName": "러닝", "durationMin": 30}
                """);

        assertThat(result.isWorkout()).isFalse();
        assertThat(result.exerciseName()).isNull();
        assertThat(result.durationMin()).isNull();
    }

    /** 0 은 "못 읽었다"와 같다 — 0분짜리 운동 기록을 만들지 않는다. */
    @Test
    void 값이_0이면_못_읽은_것으로_본다() throws Exception {
        WorkoutPhotoAnalysisResponse result = map("""
                {"isWorkout": true, "exerciseName": "트레드밀", "category": "유산소",
                 "durationMin": 0, "distanceKm": 0, "calories": 0}
                """);

        assertThat(result.durationMin()).isNull();
        assertThat(result.distanceKm()).isNull();
        assertThat(result.calories()).isNull();
        // 종목은 읽었으므로 기록 자체는 성립한다 — 시간·거리는 사용자가 채우면 된다
        assertThat(result.exerciseName()).isEqualTo("트레드밀");
    }

    /** 앱의 칩(근력/유산소/유연성) 밖의 값이 들어오면 버린다 — 어느 칩도 못 고르는 상태가 된다. */
    @Test
    void 모르는_카테고리는_버린다() throws Exception {
        WorkoutPhotoAnalysisResponse result = map("""
                {"isWorkout": true, "exerciseName": "러닝", "category": "CARDIO", "durationMin": 20}
                """);

        assertThat(result.category()).isNull();
        assertThat(result.durationMin()).isEqualTo(20);
    }

    @Test
    void 빈_문자열은_null_로_다룬다() throws Exception {
        WorkoutPhotoAnalysisResponse result = map("""
                {"isWorkout": true, "exerciseName": "  ", "sourceApp": "", "comment": " "}
                """);

        assertThat(result.exerciseName()).isNull();
        assertThat(result.sourceApp()).isNull();
        assertThat(result.comment()).isNull();
    }
}
