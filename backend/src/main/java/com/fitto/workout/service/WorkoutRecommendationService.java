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
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * AI 운동 추천 — 최근 운동 기록(텍스트)을 Gemini 에 보내 오늘/며칠간의 계획을 제안받는다.
 * 이미지 없이 텍스트만 사용하므로 음식 분석과 같은 모델(flash 계열)로 충분하다.
 *
 * <p>두 모드를 지원한다 — {@link #recommend(Long, int)}(순차: "오늘부터 N일간")와
 * {@link #recommend(Long, Set, Set, String, Set, Integer)}(프로그램: "월/수/금마다" 같은 실제 요일
 * 반복 스케줄, 집중 부위·통증 부위·세션 시간까지 반영, 짐워크 스타일 맞춤 프로그램 만들기).
 * 스키마·프롬프트·응답 매핑을 공유하되 요일 유무로 분기한다.
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
                                                                    "comment", Map.of("type", "STRING"),
                                                                    "setMethod", Map.of("type", "STRING",
                                                                            "enum", List.of("표준 세트", "탑 세트", "드랍 세트",
                                                                                    "피라미드 세트", "역피라미드 세트", "슈퍼세트",
                                                                                    "컴파운드 세트", "레스트-포즈 세트", "클러스터 세트"))),
                                                            "required", List.of("name", "category"))),
                                            "comment", Map.of("type", "STRING"),
                                            "estimatedDurationMin", Map.of("type", "INTEGER")),
                                    "required", List.of("focus", "exercises"))),
                    "overallComment", Map.of("type", "STRING"),
                    // 프로그램 모드에서만 채워짐(순차 모드 프롬프트는 언급하지 않으므로 비워둔다).
                    "programTitle", Map.of("type", "STRING")),
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
     *
     * @param focusMuscleGroups 더 키우고 싶은 집중 부위(선택) — 허용 목록 밖 값은 무시
     * @param goal              운동 목적(선택) — 허용 목록 밖 값은 무시
     * @param painAreas         현재 통증이 있는 관절 부위(선택) — 허용 목록 밖 값은 무시, 해당 부위에
     *                          부담을 주는 동작은 제외하고 구성한다(집중 부위보다 항상 우선)
     * @param sessionMinutes    세션당 목표 운동 시간(분, 선택) — 이 시간에 맞도록 종목·세트 수를 조절
     */
    public WorkoutRecommendationResponse recommend(Long userId, Set<DayOfWeek> weekdays,
                                                   Set<String> focusMuscleGroups, String goal,
                                                   Set<String> painAreas, Integer sessionMinutes) {
        List<DayOfWeek> ordered = WEEK_ORDER.stream().filter(weekdays::contains).toList();
        return generate(userId,
                historyText -> buildProgramPrompt(ordered, focusMuscleGroups, goal, painAreas, sessionMinutes, historyText),
                ordered);
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
                %s
                - overallComment 는 전체 계획 요약 한 줄입니다.
                - 기록이 없거나 적으면 초보자용으로 균형 잡힌 무리 없는 계획을 제안합니다.

                최근 운동 기록(최신순):
                %s
                """.formatted(days, days, SET_METHOD_GUIDE, historyText);
    }

    /** 집중 부위 허용 목록 — 카탈로그의 muscle_group 값과 동일. 이 밖의 값은 프롬프트에 넣지 않는다. */
    private static final Set<String> ALLOWED_FOCUS_GROUPS = Set.of("가슴", "등", "어깨", "하체", "팔", "코어");

    /**
     * 운동 목적 허용 목록 → 프롬프트 지시문. 사용자 입력 문자열이 AI 프롬프트에 그대로
     * 들어가지 않게(프롬프트 인젝션·오타 방어) 정해진 키만 매핑한다 — 프론트의 GOAL 칩과 짝.
     */
    private static final Map<String, String> GOAL_DIRECTIVES = Map.of(
            "근력 향상", "고중량·저반복(3~6회) 위주의 스트렝스 구성으로, 복합 다관절 운동(스쿼트·데드리프트·벤치프레스 등)을 각 날의 중심에 둡니다.",
            "근육 증가", "중간 무게·중간 반복(8~12회) 위주의 근비대 구성으로, 부위별 볼륨을 충분히 확보합니다.",
            "체지방 감량", "운동 사이 휴식을 짧게 가져가는 서킷 느낌의 구성에 유산소를 곁들여, 세션 전체 칼로리 소모를 높입니다.",
            "체력·건강 유지", "무리 없는 전신 균형 구성으로, 근력·유산소·유연성을 고루 섞습니다.",
            "정체기 돌파", "레스트-포즈 세트와 클러스터 세트를 스쿼트·데드리프트·벤치프레스 같은 다관절 고중량 운동에 우선 배정해(그 운동의 setMethod 에도 반영) 한계 중량 돌파를 노리고, 세트 사이 휴식은 평소보다 살짝 길게 잡습니다.");

    /**
     * 세트 구성법 가이드 — setMethod 필드를 채울 때의 기준. 리터럴 %가 없어 별도 인자로
     * 넘겨도 안전하지만(포맷 문자열 자체가 아니라 치환값이라 %% 이스케이프 불필요), 혹시
     * 모를 실수를 막기 위해 이 상수 자체에는 % 를 쓰지 않는다.
     */
    private static final String SET_METHOD_GUIDE = """
            - **setMethod**: 각 운동에 그 운동 유형과 그 날의 구성에 맞는 세트 방식을 하나 골라 채웁니다\
            (표준 세트/탑 세트/드랍 세트/피라미드 세트/역피라미드 세트/슈퍼세트/컴파운드 세트/레스트-포즈 세트/클러스터 세트 중 하나).
              - 스쿼트·데드리프트·벤치프레스·오버헤드프레스 같은 바벨 다관절 운동: 탑 세트, 피라미드 세트, 역피라미드 세트, 레스트-포즈 세트, 클러스터 세트가 적합합니다.
              - 머신·케이블·덤벨 위주의 고립 운동(레그 익스텐션, 컬, 크로스오버 등): 드랍 세트가 적합합니다.
              - 바로 이어지는 두 운동이 서로 반대 부위(길항근, 예: 가슴↔등)면 슈퍼세트로, 같은 부위를 이어서 배치했다면 컴파운드 세트로 표시합니다.
              - 초보자용이거나 최근 기록이 적으면 대부분 표준 세트로 무리 없게 구성하고, 고급 기법(드랍/레스트-포즈/클러스터 세트)은 하루에 1~2개 운동에만 적용합니다.
              - 통증이 있는 부위와 관련된 운동에는 실패 지점까지 밀어붙이는 고강도 기법(드랍/레스트-포즈/클러스터 세트)을 적용하지 않고 표준 세트로 둡니다.""";

    /** 통증 부위 허용 목록 — 관절 기준(집중 부위의 근육군 축과 다르다). 이 밖의 값은 프롬프트에 넣지 않는다. */
    private static final Set<String> ALLOWED_PAIN_AREAS =
            Set.of("무릎", "허리", "어깨", "팔꿈치", "손목", "발목", "목");

    /** 통증 부위 → 회피 지시문. focusMuscleGroups 와 겹치더라도 통증이 항상 우선임을 프롬프트에 못박는다. */
    private static final Map<String, String> PAIN_DIRECTIVES = Map.of(
            "무릎", "스쿼트·런지·점프 계열 등 무릎을 크게 굽히는 동작은 제외하고, 레그 익스텐션(가벼운 중량)이나 상체 위주로 대체합니다.",
            "허리", "데드리프트·굿모닝·허리를 굽히는 윗몸일으키기 등 척추에 축성 하중이나 굴곡이 실리는 동작은 제외하고, 코어는 플랭크류(중립 척추)나 머신 위주 하체로 대체합니다.",
            "어깨", "오버헤드 프레스·업라이트 로우·딥스 등 어깨를 크게 젖히거나 과가동하는 동작은 제외하고, 가슴·등 위주 또는 가동범위를 좁힌 동작으로 대체합니다.",
            "팔꿈치", "클로즈그립 프레스·딥스·고중량 컬 등 팔꿈치에 부하가 집중되는 동작은 제외하고, 가벼운 중량이나 머신 위주로 대체합니다.",
            "손목", "푸시업·프론트 스쿼트처럼 손목을 젖힌 채 버티는 동작은 제외하고, 스트랩이나 머신을 활용한 동작으로 대체합니다.",
            "발목", "점프·런지·카프레이즈 등 발목을 크게 움직이는 동작은 제외하고, 고정된 하체 머신이나 상체 위주로 대체합니다.",
            "목", "오버헤드 프레스 고중량이나 목에 긴장이 실리는 자세는 피하고, 목 부담이 적은 자세로 구성합니다.");

    /**
     * 프로그램 모드 프롬프트(맞춤 프로그램 만들기) — "월/수/금마다 운동해요" 처럼 실제 반복
     * 요일을 그대로 주고, 요일마다 다른 하루를 짜게 한다. 집중 부위·운동 목적·통증 부위·세션 시간이
     * 있으면 그에 맞는 지시문을 덧붙인다. {@link #buildPrompt} 와 마찬가지로 리터럴 %는 %% 로
     * 이스케이프해야 한다(package-private, 테스트에서 직접 검증).
     */
    String buildProgramPrompt(List<DayOfWeek> weekdays, Set<String> focusMuscleGroups, String goal,
                              Set<String> painAreas, Integer sessionMinutes, String historyText) {
        String weekdayNames = weekdays.stream()
                .map(d -> KOREAN_WEEKDAY_NAMES.get(WEEK_ORDER.indexOf(d)))
                .collect(Collectors.joining(", "));

        // 집중 부위·목적·통증 부위는 허용 목록으로 거른 뒤에만 프롬프트에 싣는다 — 자유 문자열이
        // 지시문 자리에 그대로 들어가는 걸 막는 안전망(오타·프롬프트 인젝션 방어).
        // null 원소부터 걸러야 한다 — ALLOWED_FOCUS_GROUPS 는 Set.of(...) 불변 집합이라
        // contains(null) 이 false 대신 NPE 를 던진다("["가슴", null]" 같은 요청 바디가
        // Set<String> 으로 역직렬화되면 null 원소가 그대로 들어온다).
        String focusDirective = "";
        if (focusMuscleGroups != null) {
            String filtered = focusMuscleGroups.stream()
                    .filter(Objects::nonNull)
                    .filter(ALLOWED_FOCUS_GROUPS::contains)
                    .collect(Collectors.joining(", "));
            if (!filtered.isEmpty()) {
                focusDirective = "\n- **집중 부위**: 사용자가 %s 를 더 키우고 싶어합니다. 이 부위(들)에 주간 볼륨을 더 배정하되(예: 주 2회 편성 또는 그 날의 운동 수를 늘림), 다른 부위도 최소한의 균형은 유지합니다."
                        .formatted(filtered);
            }
        }
        String goalDirective = goal != null && GOAL_DIRECTIVES.containsKey(goal)
                ? "\n- **운동 목적(%s)**: %s".formatted(goal, GOAL_DIRECTIVES.get(goal))
                : "";

        // 통증 부위는 집중 부위·목적보다 항상 우선 — 키우고 싶은 부위와 겹쳐도 회피가 먼저다.
        String painDirective = "";
        if (painAreas != null) {
            List<String> filtered = painAreas.stream()
                    .filter(Objects::nonNull)
                    .filter(ALLOWED_PAIN_AREAS::contains)
                    .toList();
            if (!filtered.isEmpty()) {
                String areaNames = String.join(", ", filtered);
                String avoidRules = filtered.stream()
                        .map(a -> "%s: %s".formatted(a, PAIN_DIRECTIVES.get(a)))
                        .collect(Collectors.joining(" "));
                painDirective = "\n- **통증 부위(항상 최우선)**: 사용자가 현재 %s 에 통증이 있습니다. 위 집중 부위·운동 목적과 겹치더라도 이 지시가 항상 우선합니다. %s"
                        .formatted(areaNames, avoidRules);
            }
        }

        String durationDirective = sessionMinutes != null
                ? "\n- **세션 시간**: 각 날의 세트 간 휴식을 포함한 총 소요 시간이 약 %d분이 되도록 종목 수와 세트 수를 조절합니다(대략 30분≈종목 4~5개, 60분≈종목 6~8개, 90분≈종목 8~10개 기준). 각 하루 항목의 estimatedDurationMin 에 그 예상 소요 시간(분)을 채웁니다."
                .formatted(sessionMinutes)
                : "";

        return """
                당신은 커플 운동 앱의 다정한 퍼스널 트레이너입니다. 사용자가 매주 %s 에 운동합니다.
                아래 사용자의 최근 운동 기록을 참고해, 이 요일들에 각각 다른 하루 계획을 세워
                하나의 프로그램으로 제안해 주세요.

                규칙:
                - days 배열은 정확히 %d개(%s) 를 빠짐없이 채우고, 각 항목의 dayOfWeek 는 위 요일 중
                  하나와 정확히 일치해야 하며 중복 없이 서로 달라야 합니다. dayOffset 은 채우지 않아도 됩니다.
                - 같은 부위를 이틀 연속 요일에 몰아넣지 말고, 요일 순서대로 부위를 분산합니다.
                  (예: 월=가슴, 수=등, 금=하체 처럼 — 요일 사이 간격이 짧을수록 회복을 더 고려)%s%s%s%s
                - **점진적 과부하**: 이전에 한 운동을 다시 제안할 땐 지난 기록의 무게·횟수보다
                  살짝(약 5~10%%) 높여서 성장하도록 하되, 절대 무리하지 않는 선으로 합니다.
                - focus 는 그 날의 핵심 테마입니다. (예: "가슴·삼두", "하체 근력")
                - 각 운동의 category 는 반드시 근력/유산소/유연성 중 하나입니다.
                - sets/reps 는 근력 운동에만 제안하고, 유산소/유연성은 comment 에 시간·강도를 적습니다.
                - **comment 에는 그 운동의 올바른 자세 핵심 팁을 한 가지 꼭 포함**하고 다정한 톤으로 씁니다.
                  (예: "무릎이 발끝을 넘지 않게!", "허리는 곧게 편 채로")
                %s
                - **programTitle**: 이 프로그램의 이름을 20자 내외로 지어주세요. 요일 수와 위에서 선택된
                  조건들(있다면)이 드러나면 좋습니다. (예: 월/수/금+하체 강조+근력 향상 목표 → "주 3일
                  하체 강화 스트렝스", 화/목+체지방 감량 목표 → "주 2일 전신 서킷 다이어트") 특별한 조건이
                  없으면 "주 %d일 밸런스 프로그램" 처럼 무난하게 짓습니다.
                - overallComment 는 이 프로그램 전체를 한 줄로 요약합니다.
                - 기록이 없거나 적으면 초보자용으로 균형 잡힌 무리 없는 계획을 제안합니다.

                최근 운동 기록(최신순):
                %s
                """.formatted(weekdayNames, weekdays.size(), weekdayNames, focusDirective, goalDirective,
                painDirective, durationDirective, SET_METHOD_GUIDE, weekdays.size(), historyText);
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
                        ex.path("comment").asText(null),
                        ex.path("setMethod").asText(null)));
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
                    day.path("comment").asText(null),
                    day.hasNonNull("estimatedDurationMin") ? day.path("estimatedDurationMin").asInt() : null));
        }
        if (days.isEmpty()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        return new WorkoutRecommendationResponse(days, result.path("overallComment").asText(null),
                result.path("programTitle").asText(null));
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
