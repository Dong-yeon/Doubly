package com.fitto.workout.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.workout.dto.WorkoutRecommendationResponse;
import com.fitto.workout.dto.WorkoutRecommendationResponse.DayPlan;
import com.fitto.workout.dto.WorkoutRecommendationResponse.RecommendedExercise;
import com.fitto.workout.dto.WorkoutResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI 운동 추천 — 최근 운동 기록(텍스트)을 Gemini 에 보내 오늘/며칠간의 계획을 제안받는다.
 * 이미지 없이 텍스트만 사용하므로 음식 분석과 같은 모델(flash 계열)로 충분하다.
 */
@Service
public class WorkoutRecommendationService {

    /** Gemini 구조화 출력(JSON mode) 스키마 */
    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "days", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "dayOffset", Map.of("type", "INTEGER"),
                                            "focus", Map.of("type", "STRING"),
                                            "exercises", Map.of(
                                                    "type", "ARRAY",
                                                    "items", Map.of(
                                                            "type", "OBJECT",
                                                            "properties", Map.of(
                                                                    "name", Map.of("type", "STRING"),
                                                                    "category", Map.of("type", "STRING",
                                                                            "enum", List.of("근력", "유산소", "유연성")),
                                                                    "sets", Map.of("type", "INTEGER"),
                                                                    "reps", Map.of("type", "INTEGER"),
                                                                    "comment", Map.of("type", "STRING")),
                                                            "required", List.of("name", "category"))),
                                            "comment", Map.of("type", "STRING")),
                                    "required", List.of("dayOffset", "focus", "exercises"))),
                    "overallComment", Map.of("type", "STRING")),
            "required", List.of("days"));

    private final GeminiClient geminiClient;
    private final WorkoutService workoutService;

    public WorkoutRecommendationService(GeminiClient geminiClient, WorkoutService workoutService) {
        this.geminiClient = geminiClient;
        this.workoutService = workoutService;
    }

    public WorkoutRecommendationResponse recommend(Long userId, int days) {
        geminiClient.requireConfiguredAndCountUsage(userId);

        // 최근 기록(최신순 1페이지)을 트랜잭션 안에서 DTO 로 받아온 뒤, Gemini 호출은 트랜잭션 밖에서 수행
        List<WorkoutResponse> history = workoutService.findHistory(userId, null);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(buildPrompt(days, buildHistoryText(history)))),
                RESPONSE_SCHEMA);
        return toResponse(result);
    }

    // ---- 프롬프트 ----

    private String buildPrompt(int days, String historyText) {
        return """
                당신은 커플 운동 앱의 다정한 퍼스널 트레이너입니다. 아래 사용자의 최근 운동 기록을 참고해
                오늘부터 %d일간의 운동 계획을 제안해 주세요.

                규칙:
                - dayOffset 은 0(오늘)부터 시작하는 날짜 오프셋이며, 총 %d일을 빠짐없이 채웁니다.
                - 최근에 많이 한 부위/운동은 피하고 부족한 부분을 보완하도록 구성하며, 근육 회복도 고려합니다.
                  (예: 어제 등을 했다면 오늘은 하체나 가슴, 또는 가벼운 유산소를 제안)
                - focus 는 그 날의 핵심 테마입니다. (예: "하체 근력", "가벼운 유산소 + 코어")
                - 각 운동의 category 는 반드시 근력/유산소/유연성 중 하나입니다.
                - sets/reps 는 근력 운동에만 제안하고, 유산소/유연성은 comment 에 시간·강도를 적습니다.
                - comment 는 짧고 다정한 한국어 한 줄, overallComment 는 전체 계획 요약 한 줄입니다.
                - 기록이 없거나 적으면 초보자용으로 균형 잡힌 무리 없는 계획을 제안합니다.

                최근 운동 기록(최신순):
                %s
                """.formatted(days, days, historyText);
    }

    private String buildHistoryText(List<WorkoutResponse> history) {
        if (history.isEmpty()) {
            return "(기록 없음)";
        }
        return history.stream()
                .map(w -> "- " + w.workoutDate()
                        + (w.totalDurationMin() != null ? " (" + w.totalDurationMin() + "분)" : "")
                        + ": " + w.sets().stream().map(this::describeSet).collect(Collectors.joining(", "))
                        + (w.memo() != null && !w.memo().isBlank() ? " — " + w.memo() : ""))
                .collect(Collectors.joining("\n"));
    }

    private String describeSet(WorkoutResponse.SetResponse s) {
        StringBuilder sb = new StringBuilder(s.exerciseName());
        if (s.category() != null) sb.append("[").append(s.category()).append("]");
        if (s.sets() != null && s.reps() != null) sb.append(" ").append(s.sets()).append("x").append(s.reps());
        if (s.weightKg() != null) sb.append(" ").append(s.weightKg().stripTrailingZeros().toPlainString()).append("kg");
        return sb.toString();
    }

    // ---- 응답 매핑 ----

    private WorkoutRecommendationResponse toResponse(JsonNode result) {
        List<DayPlan> days = new ArrayList<>();
        for (JsonNode day : result.path("days")) {
            List<RecommendedExercise> exercises = new ArrayList<>();
            for (JsonNode ex : day.path("exercises")) {
                String name = ex.path("name").asText("");
                if (name.isBlank()) continue;
                exercises.add(new RecommendedExercise(
                        name,
                        ex.path("category").asText(null),
                        ex.hasNonNull("sets") ? ex.path("sets").asInt() : null,
                        ex.hasNonNull("reps") ? ex.path("reps").asInt() : null,
                        ex.path("comment").asText(null)));
            }
            if (exercises.isEmpty()) continue;
            days.add(new DayPlan(
                    day.path("dayOffset").asInt(days.size()),
                    day.path("focus").asText(""),
                    exercises,
                    day.path("comment").asText(null)));
        }
        if (days.isEmpty()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        return new WorkoutRecommendationResponse(days, result.path("overallComment").asText(null));
    }
}
