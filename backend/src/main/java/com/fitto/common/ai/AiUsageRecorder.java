package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.plan.Feature;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Gemini 응답의 {@code usageMetadata} 를 {@link AiUsageLog} 로 적재한다.
 *
 * <p><b>계측이 기능을 깨뜨리지 않는다</b>가 이 클래스의 유일한 불변식이다. 여기서 던지는 예외는
 * 전부 삼킨다 — 토큰을 못 남긴 건 나중에 고칠 수 있지만, 그것 때문에 사용자가 기다리던 AI 결과가
 * 날아가면 되돌릴 방법이 없다. 호출자({@link GeminiClient})는 이미 성공한 응답을 손에 쥔 상태다.
 *
 * <p>DB 와 별개로 Micrometer 카운터도 함께 올린다. 둘은 답하는 질문이 다르다 —
 * DB 는 "지난달 누가 얼마나 썼나"(사후 집계), 카운터는 "지금 토큰이 튀고 있나"(실시간).
 * 카운터에는 <b>user 태그를 달지 않는다</b>(카디널리티 폭발). 유저별은 DB 쪽 일이다.
 */
@Component
public class AiUsageRecorder {

    private static final Logger log = LoggerFactory.getLogger(AiUsageRecorder.class);

    private final AiUsageLogRepository repository;
    private final MeterRegistry meterRegistry;

    public AiUsageRecorder(AiUsageLogRepository repository, MeterRegistry meterRegistry) {
        this.repository = repository;
        this.meterRegistry = meterRegistry;
    }

    /**
     * 성공한 호출 하나를 남긴다. {@code root} 에 {@code usageMetadata} 가 없으면 조용히 넘어간다
     * — 구버전 응답이나 모델별 차이로 빠질 수 있고, 그건 경고할 일이 아니다.
     *
     * @param attempt 이 모델에 대한 몇 번째 시도에서 성공했는가(1 이면 재시도 없음)
     */
    public void recordUsage(Long userId, Feature feature, String model, JsonNode root,
                            int imageCount, int attempt) {
        try {
            if (root == null) {
                return;
            }
            JsonNode usage = root.path("usageMetadata");
            if (usage.isMissingNode() || !usage.isObject()) {
                return;
            }
            int prompt = usage.path("promptTokenCount").asInt(0);
            int candidates = usage.path("candidatesTokenCount").asInt(0);
            int thoughts = usage.path("thoughtsTokenCount").asInt(0);
            int cached = usage.path("cachedContentTokenCount").asInt(0);
            int total = usage.path("totalTokenCount").asInt(0);

            repository.save(AiUsageLog.builder()
                    .userId(userId)
                    .feature(feature)
                    .model(model)
                    .promptTokens(prompt)
                    .candidatesTokens(candidates)
                    .thoughtsTokens(thoughts)
                    .cachedTokens(cached)
                    .totalTokens(total)
                    .imageCount(imageCount)
                    .attempt(attempt)
                    .build());

            count(model, feature, "prompt", prompt);
            count(model, feature, "candidates", candidates);
            count(model, feature, "thoughts", thoughts);
        } catch (Exception e) {
            // 계측 실패가 AI 결과를 깨뜨리지 않는다 — 클래스 주석의 불변식
            log.warn("AI 토큰 사용량 기록 실패(모델={}): {}", model, e.toString());
        }
    }

    private void count(String model, Feature feature, String kind, int tokens) {
        if (tokens <= 0) {
            return;
        }
        Counter.builder("fitto.ai.gemini.tokens")
                .description("Gemini 토큰 사용량 — 종류별 누적")
                .tag("model", model)
                .tag("feature", feature == null ? "UNKNOWN" : feature.name())
                .tag("kind", kind)
                .register(meterRegistry)
                .increment(tokens);
    }
}
