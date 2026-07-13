package com.fitto.summary.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
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
    private final SummaryService summaryService;

    public WeeklyLetterService(GeminiClient geminiClient, SummaryService summaryService) {
        this.geminiClient = geminiClient;
        this.summaryService = summaryService;
    }

    public WeeklyLetterResponse letter(Long userId) {
        WeeklyRecapResponse recap = summaryService.weeklyRecap(userId);
        int totalActivity = recap.myWorkoutDays() + recap.myMealDays()
                + recap.partnerWorkoutDays() + recap.partnerMealDays();
        if (totalActivity == 0) {
            return WeeklyLetterResponse.empty();
        }

        geminiClient.requireConfiguredAndCountUsage(userId);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(PROMPT.formatted(describe(recap)))), SCHEMA);
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
