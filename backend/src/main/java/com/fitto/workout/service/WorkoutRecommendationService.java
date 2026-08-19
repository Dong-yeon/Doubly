package com.fitto.workout.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.workout.dto.WorkoutRecommendationResponse;
import com.fitto.workout.dto.WorkoutRecommendationResponse.DayPlan;
import com.fitto.workout.dto.WorkoutRecommendationResponse.RecommendedExercise;
import com.fitto.workout.dto.WorkoutResponse;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * AI 운동 추천 — 최근 운동 기록(텍스트)을 Gemini 에 보내 오늘/며칠간의 계획을 제안받는다.
 * 이미지 없이 텍스트만 사용하므로 음식 분석과 같은 모델(flash 계열)로 충분하다.
 *
 * <p>두 모드를 지원한다 — {@link #recommend(Long, int)}(순차: "오늘부터 N일간")와
 * {@link #recommend(Long, Set)}(프로그램: "월/수/금마다" 같은 실제 요일 반복 스케줄,
 * 짐워크 스타일 맞춤 프로그램 만들기). 스키마·프롬프트·응답 매핑을 공유하되 요일 유무로 분기한다.
 */
@Service
public class WorkoutRecommendationService {

    /** 요일 이름은 프롬프트/스키마 모두에서 이 순서(월→일)로만 다룬다. */
    private static final List<DayOfWeek> WEEK_ORDER = List.of(
            DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);
    private static final List<String> KOREAN_WEEKDAY_NAMES =
            List.of("월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일");

    /** Gemini 구조화 출력(JSON mode) 스키마 — dayOffset/dayOfWeek 둘 다 선언해두고 모드에 따라 프롬프트로 어느 쪽을 채울지 지시한다. */
    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "days", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "dayOffset", Map.of("type", "INTEGER"),
                                            "dayOfWeek", Map.of("type", "STRING",
                                                    "enum", List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY",
                                                            "FRIDAY", "SATURDAY", "SUNDAY")),
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
                                    "required", List.of("focus", "exercises"))),
                    "overallComment", Map.of("type", "STRING")),
            "required", List.of("days"));

    private final GeminiClient geminiClient;
    private final WorkoutService workoutService;

    public WorkoutRecommendationService(GeminiClient geminiClient, WorkoutService workoutService) {
        this.geminiClient = geminiClient;
        this.workoutService = workoutService;
    }

    /** 순차 모드 — "오늘부터 N일간". */
    public WorkoutRecommendationResponse recommend(Long userId, int days) {
        return generate(userId, historyText -> buildPrompt(days, historyText), null);
    }

    /**
     * 프로그램 모드(맞춤 프로그램 만들기) — 실제로 운동할 요일들을 그대로 넘기면, 요일마다
     * 서로 다른 하루 계획(예: 월=가슴, 수=등, 금=하체)을 세워 각 요일에 배정해 돌려준다.
     * 요청한 요일 수만큼 정확히 채워지도록, AI 응답의 dayOfWeek 가 비거나 요청 밖이면
     * 순서대로 폴백한다({@link #toResponse}).
     */
    public WorkoutRecommendationResponse recommend(Long userId, Set<DayOfWeek> weekdays) {
        List<DayOfWeek> ordered = WEEK_ORDER.stream().filter(weekdays::contains).toList();
        return generate(userId, historyText -> buildProgramPrompt(ordered, historyText), ordered);
    }

    private WorkoutRecommendationResponse generate(
            Long userId, java.util.function.Function<String, String> promptBuilder, List<DayOfWeek> programWeekdays) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_WORKOUT_RECOMMEND);

        // 최근 기록(최신순 1페이지)을 트랜잭션 안에서 DTO 로 받아온 뒤, Gemini 호출은 트랜잭션 밖에서 수행
        List<WorkoutResponse> history = workoutService.findHistory(userId, null);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(promptBuilder.apply(buildHistoryText(history)))),
                RESPONSE_SCHEMA);
        return toResponse(result, programWeekdays);
    }

    // ---- 프롬프트 ----

    /**
     * 프롬프트 조립 — 텍스트에 리터럴 % 를 쓸 땐 반드시 %% 로 이스케이프해야 한다
     * ({@code formatted()} 가 String.format 이라 %) 같은 건 UnknownFormatConversionException).
     * 테스트에서 직접 검증하려고 package-private 로 둔다.
     */
    String buildPrompt(int days, String historyText) {
        return """
                당신은 커플 운동 앱의 다정한 퍼스널 트레이너입니다. 아래 사용자의 최근 운동 기록을 참고해
                오늘부터 %d일간의 운동 계획을 제안해 주세요.

                규칙:
                - dayOffset 은 0(오늘)부터 시작하는 날짜 오프셋이며, 총 %d일을 빠짐없이 채웁니다.
                - 최근에 많이 한 부위/운동은 피하고 부족한 부분을 보완하도록 구성하며, 근육 회복도 고려합니다.
                  (예: 어제 등을 했다면 오늘은 하체나 가슴, 또는 가벼운 유산소를 제안)
                - **점진적 과부하**: 이전에 한 운동을 다시 제안할 땐 지난 기록의 무게·횟수보다
                  살짝(약 5~10%%) 높여서 성장하도록 하되, 절대 무리하지 않는 선으로 합니다.
                - focus 는 그 날의 핵심 테마입니다. (예: "하체 근력", "가벼운 유산소 + 코어")
                - 각 운동의 category 는 반드시 근력/유산소/유연성 중 하나입니다.
                - sets/reps 는 근력 운동에만 제안하고, 유산소/유연성은 comment 에 시간·강도를 적습니다.
                - **comment 에는 그 운동의 올바른 자세 핵심 팁을 한 가지 꼭 포함**하고 다정한 톤으로 씁니다.
                  (예: "무릎이 발끝을 넘지 않게!", "허리는 곧게 편 채로")
                - overallComment 는 전체 계획 요약 한 줄입니다.
                - 기록이 없거나 적으면 초보자용으로 균형 잡힌 무리 없는 계획을 제안합니다.

                최근 운동 기록(최신순):
                %s
                """.formatted(days, days, historyText);
    }

    /**
     * 프로그램 모드 프롬프트(맞춤 프로그램 만들기) — "월/수/금마다 운동해요" 처럼 실제 반복
     * 요일을 그대로 주고, 요일마다 다른 하루를 짜게 한다. {@link #buildPrompt} 와 마찬가지로
     * 리터럴 %는 %% 로 이스케이프해야 한다(package-private, 테스트에서 직접 검증).
     */
    String buildProgramPrompt(List<DayOfWeek> weekdays, String historyText) {
        String weekdayNames = weekdays.stream()
                .map(d -> KOREAN_WEEKDAY_NAMES.get(WEEK_ORDER.indexOf(d)))
                .collect(Collectors.joining(", "));
        return """
                당신은 커플 운동 앱의 다정한 퍼스널 트레이너입니다. 사용자가 매주 %s 에 운동합니다.
                아래 사용자의 최근 운동 기록을 참고해, 이 요일들에 각각 다른 하루 계획을 세워
                하나의 프로그램으로 제안해 주세요.

                규칙:
                - days 배열은 정확히 %d개(%s) 를 빠짐없이 채우고, 각 항목의 dayOfWeek 는 위 요일 중
                  하나와 정확히 일치해야 하며 중복 없이 서로 달라야 합니다. dayOffset 은 채우지 않아도 됩니다.
                - 같은 부위를 이틀 연속 요일에 몰아넣지 말고, 요일 순서대로 부위를 분산합니다.
                  (예: 월=가슴, 수=등, 금=하체 처럼 — 요일 사이 간격이 짧을수록 회복을 더 고려)
                - **점진적 과부하**: 이전에 한 운동을 다시 제안할 땐 지난 기록의 무게·횟수보다
                  살짝(약 5~10%%) 높여서 성장하도록 하되, 절대 무리하지 않는 선으로 합니다.
                - focus 는 그 날의 핵심 테마입니다. (예: "가슴·삼두", "하체 근력")
                - 각 운동의 category 는 반드시 근력/유산소/유연성 중 하나입니다.
                - sets/reps 는 근력 운동에만 제안하고, 유산소/유연성은 comment 에 시간·강도를 적습니다.
                - **comment 에는 그 운동의 올바른 자세 핵심 팁을 한 가지 꼭 포함**하고 다정한 톤으로 씁니다.
                  (예: "무릎이 발끝을 넘지 않게!", "허리는 곧게 편 채로")
                - overallComment 는 이 프로그램 전체를 한 줄로 요약합니다.
                - 기록이 없거나 적으면 초보자용으로 균형 잡힌 무리 없는 계획을 제안합니다.

                최근 운동 기록(최신순):
                %s
                """.formatted(weekdayNames, weekdays.size(), weekdayNames, historyText);
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

    /**
     * @param programWeekdays 프로그램 모드일 때만(요청한 요일 목록, 월→일 순). null 이면 순차 모드 —
     *                        dayOfWeek 는 채우지 않고 dayOffset 만 쓴다.
     */
    private WorkoutRecommendationResponse toResponse(JsonNode result, List<DayOfWeek> programWeekdays) {
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

            DayOfWeek dayOfWeek = null;
            if (programWeekdays != null) {
                // 프로그램 모드 — 요청한 요일 수를 넘기면 그 뒤는 버린다(자리 없음).
                if (days.size() >= programWeekdays.size()) continue;
                // AI 가 응답한 dayOfWeek 가 요청 범위 안이면 그대로, 아니면(누락·오타·범위 밖)
                // 지금까지 안 나온 요일 중 순서대로 배정해 요청한 요일 수만큼은 꼭 채운다.
                DayOfWeek fromModel = parseDayOfWeek(day.path("dayOfWeek").asText(null));
                boolean alreadyUsed = fromModel != null
                        && days.stream().anyMatch(d -> d.dayOfWeek() == fromModel);
                dayOfWeek = (fromModel != null && !alreadyUsed) ? fromModel : nextUnusedWeekday(programWeekdays, days);
            }

            days.add(new DayPlan(
                    day.path("dayOffset").asInt(days.size()),
                    dayOfWeek,
                    day.path("focus").asText(""),
                    exercises,
                    day.path("comment").asText(null)));
        }
        if (days.isEmpty()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        return new WorkoutRecommendationResponse(days, result.path("overallComment").asText(null));
    }

    private DayOfWeek parseDayOfWeek(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return DayOfWeek.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private DayOfWeek nextUnusedWeekday(List<DayOfWeek> programWeekdays, List<DayPlan> soFar) {
        return programWeekdays.stream()
                .filter(d -> soFar.stream().noneMatch(p -> p.dayOfWeek() == d))
                .findFirst()
                .orElse(null);
    }
}
