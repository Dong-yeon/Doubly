package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.AiResultCache;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.dto.DietCoachResponse;
import com.fitto.diet.repository.MealRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 주간 식단 AI 코칭 — 최근 7일 식단 기록을 모아 Gemini 로 영양 균형 피드백을 생성한다.
 * 개별 사진 분석({@link FoodAnalysisService})과 달리 '기간 단위 습관'을 본다.
 *
 * <p><b>트랜잭션을 걸지 않는다.</b> 예전엔 클래스에 {@code @Transactional(readOnly = true)} 가
 * 붙어 있었는데, 그러면 식단 조회로 잡은 DB 커넥션을 <b>Gemini 응답을 기다리는 수십 초 동안
 * 문 채로</b> 있게 된다. Hikari 기본 풀이 10개라 AI 요청 10건이면 풀이 비고, 그때부터는
 * 로그인·채팅 같은 <b>AI 와 무관한 요청까지</b> 커넥션을 못 얻어 죽는다 — "서버가 끊긴다"의 정체다.
 * ({@code ExpoPushNotificationService} 가 푸시 발송에 대해 지키는 원칙과 같다: 외부 호출은
 * 커넥션을 쥐고 기다리지 않는다.)
 *
 * <p>읽기가 {@code mealRepository} 한 번뿐이라 별도 트랜잭션 경계가 필요 없다 —
 * Spring Data 리포지토리 메서드가 각자 짧은 트랜잭션으로 처리하고 바로 커넥션을 돌려준다.
 * 조회 결과는 준영속(detached) 이지만 {@link #summarize}가 스칼라 필드만 읽으므로 문제없다
 * ({@code Meal.items} 는 이 경로에서 건드리지 않는다).
 */
@Service
public class DietCoachService {

    private static final int MIN_MEALS = 3; // 이보다 적으면 코칭 무의미

    private static final String PROMPT = """
            아래는 한 사용자의 최근 7일 식단 기록입니다. 영양·식습관 코치로서 분석해 주세요.
            - headline: 이번 주 식단을 한 줄로 다정하게 요약 (한국어, 격려 톤)
            - tips: 구체적이고 실천 가능한 개선 제안 2~3개 (각 한 문장, 한국어). 예: "저녁에 단백질이 부족해요. 닭가슴살이나 두부를 더해보세요."
            - balanceScore: 영양 균형/규칙성을 0~100 으로 평가
            기록이 적더라도 있는 정보로만 판단하고, 단정적 의학 조언은 피하세요.

            [식단 기록]
            %s
            """;

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "headline", Map.of("type", "STRING"),
                    "tips", Map.of("type", "ARRAY", "items", Map.of("type", "STRING")),
                    "balanceScore", Map.of("type", "INTEGER")),
            "required", List.of("headline", "tips", "balanceScore"));

    private final GeminiClient geminiClient;
    private final AiResultCache aiResultCache;
    private final MealRepository mealRepository;

    public DietCoachService(GeminiClient geminiClient, AiResultCache aiResultCache,
                            MealRepository mealRepository) {
        this.geminiClient = geminiClient;
        this.aiResultCache = aiResultCache;
        this.mealRepository = mealRepository;
    }

    /**
     * @param refresh 사용자가 "다시 받기"를 눌렀는가 — 캐시를 건너뛰고 새로 생성한다.
     *                평소에는 식단 기록이 그대로면 {@link AiResultCache} 가 이전 코칭을 즉시 돌려준다
     *                (기록을 하나라도 새로 적으면 요약 문자열이 달라져 자동으로 다시 생성된다).
     */
    public DietCoachResponse coach(Long userId, boolean refresh) {
        LocalDate today = KstClock.today();
        List<Meal> meals = mealRepository.findByUserIdAndMealDateBetween(userId, today.minusDays(6), today);
        if (meals.size() < MIN_MEALS) {
            return DietCoachResponse.empty();
        }

        String input = summarize(meals);
        return aiResultCache.remember(userId, Feature.AI_DIET_COACH, input, refresh,
                DietCoachResponse.class, () -> generate(userId, input));
    }

    private DietCoachResponse generate(Long userId, String input) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_DIET_COACH);
        JsonNode result = geminiClient.generateJson(userId, Feature.AI_DIET_COACH,
                List.of(GeminiClient.textPart(PROMPT.formatted(input))), SCHEMA);

        List<String> tips = new ArrayList<>();
        for (JsonNode t : result.path("tips")) {
            String tip = t.asText("");
            if (!tip.isBlank()) tips.add(tip);
        }
        int score = Math.max(0, Math.min(100, result.path("balanceScore").asInt(0)));
        String headline = result.path("headline").asText("이번 주도 기록하느라 수고했어요!");
        return new DietCoachResponse(true, headline, tips, score);
    }

    /** 기록을 날짜·끼니별 한 줄로 요약 (칼로리·메모 포함). */
    private String summarize(List<Meal> meals) {
        StringBuilder sb = new StringBuilder();
        for (Meal m : meals) {
            sb.append("- ").append(m.getMealDate()).append(' ')
                    .append(m.getMealType().label());
            if (m.getCalories() != null) sb.append(" (").append(m.getCalories()).append("kcal)");
            if (m.getMemo() != null && !m.getMemo().isBlank()) sb.append(": ").append(m.getMemo().trim());
            sb.append('\n');
        }
        return sb.toString();
    }
}
