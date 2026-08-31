package com.fitto.summary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.AiResultCache;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.summary.dto.WeeklyLetterResponse;
import com.fitto.summary.dto.WeeklyRecapResponse;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * AI 커플 주간 레터 — {@link SummaryService} 의 주간 결산 수치를 Gemini 로
 * 다정한 한 편의 글로 풀어낸다. 감성 요약이라 리텐션에 기여한다.
 */
@Service
public class WeeklyLetterService {

    private static final String PROMPT = """
            아래는 한 커플의 지난주(월~일) 운동·식단 기록 요약입니다.
            이 수치를 바탕으로, 두 사람에게 보내는 따뜻하고 다정한 '주간 레터'를 한국어로 써주세요.
            - 이 편지는 커플 두 사람 중 누가 읽어도 똑같이 자연스러워야 합니다. 아래 요약의
              "나"는 편지를 읽는 바로 그 사람을 가리키는 게 아니라 <b>입력을 만든 임의의 한쪽</b>
              일 뿐입니다 — "사랑하는 OOO에게"처럼 요약에 나온 상대방 이름을 인사말에 쓰지
              마세요("나"에게는 이름이 없어 실수로 상대방 이름을 인사 대상으로 쓰기 쉽습니다).
              "사랑하는 우리에게", "우리 둘에게"처럼 두 사람 모두를 향한 인사로 시작하세요.
              본문 중 특정 활동을 짚어 말할 때 상대방 이름을 자연스럽게 쓰는 건 괜찮습니다.
            - 3~4문장, 편지처럼 자연스럽게. 잘한 점은 구체적으로 칭찬하고, 다음 주를 함께 응원합니다.
            - 수치를 그대로 나열하지 말고 이야기처럼 녹여냅니다.
            - 이모지를 1~2개 자연스럽게 섞어도 좋습니다.
            - letter 필드 하나로만 응답합니다.

            [지난주 요약]
            %s
            """;

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of("letter", Map.of("type", "STRING")),
            "required", List.of("letter"));

    private final GeminiClient geminiClient;
    private final AiResultCache aiResultCache;
    private final SummaryService summaryService;

    public WeeklyLetterService(GeminiClient geminiClient, AiResultCache aiResultCache,
                               SummaryService summaryService) {
        this.geminiClient = geminiClient;
        this.aiResultCache = aiResultCache;
        this.summaryService = summaryService;
    }

    /**
     * @param refresh 사용자가 "다시 받기"를 눌렀는가 — 캐시를 건너뛰고 새로 쓴다.
     *                지난주 결산 수치는 주중에 바뀌지 않으므로, 평소에는 한 주 내내 같은 편지를
     *                {@link AiResultCache} 가 즉시 돌려준다. 편지는 한 번 받고 다시 열어보는
     *                성격이라 매번 문장이 달라지는 편이 오히려 어색하다.
     */
    public WeeklyLetterResponse letter(Long userId, boolean refresh) {
        WeeklyRecapResponse recap = summaryService.weeklyRecap(userId);
        int totalActivity = recap.myWorkoutDays() + recap.myMealDays()
                + recap.partnerWorkoutDays() + recap.partnerMealDays();
        if (totalActivity == 0) {
            return WeeklyLetterResponse.empty();
        }

        String input = describe(recap);
        return aiResultCache.remember(userId, Feature.AI_WEEKLY_LETTER, input, refresh,
                WeeklyLetterResponse.class, () -> generate(userId, input));
    }

    private WeeklyLetterResponse generate(Long userId, String input) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_WEEKLY_LETTER);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(PROMPT.formatted(input))), SCHEMA);
        String letter = result.path("letter").asText("");
        return letter.isBlank()
                ? new WeeklyLetterResponse(true, "이번 주도 함께 애썼어요. 다음 주도 파이팅! 💪")
                : new WeeklyLetterResponse(true, letter.trim());
    }

    private String describe(WeeklyRecapResponse r) {
        StringBuilder sb = new StringBuilder();
        sb.append("나: 운동 ").append(r.myWorkoutDays()).append("일, 식단 ").append(r.myMealDays()).append("일\n");
        if (r.coupleConnected()) {
            String partner = r.partnerName() != null ? r.partnerName() : "상대방";
            sb.append(partner).append(": 운동 ").append(r.partnerWorkoutDays())
                    .append("일, 식단 ").append(r.partnerMealDays()).append("일\n");
            sb.append("둘 다 함께한 날: 운동 ").append(r.bothWorkoutDays())
                    .append("일, 식단 ").append(r.bothMealDays()).append("일\n");
        } else {
            sb.append("(아직 커플 미연결 — 혼자 기록 중)\n");
        }
        return sb.toString();
    }
}
