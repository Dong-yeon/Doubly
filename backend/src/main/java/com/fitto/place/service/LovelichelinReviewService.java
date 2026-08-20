package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.place.domain.Place;
import com.fitto.place.dto.LovelichelinSummaryResponse;
import com.fitto.place.dto.LovelichelinSummaryResponse.NextRecommendation;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI 럽슐랭 에디터 — 커플이 인증한(tier&gt;0) 장소들을 Gemini 에 보내
 * "이 커플은 어떤 미식 취향인가"를 요약하고 다음 추천 지역을 제안받는다.
 * {@link DateCourseService} 와 같은 구조(PROMPT/SCHEMA 상수 + generateJson)를 따른다.
 */
@Service
@Transactional(readOnly = true)
public class LovelichelinReviewService {

    private static final int MIN_CERTIFIED_PLACES = 1;

    private static final String PROMPT = """
            아래는 한 커플이 함께 검증해 '럽슐랭'으로 인증한(둘 다 만족한) 장소 목록입니다.
            이 목록을 보고 이 커플의 미식/데이트 취향을 다정하고 위트있게 한두 문장으로
            총평해 주세요. 그리고 목록에 없는 새로운 지역/동네를 하나 추천하고 이유를 덧붙여 주세요.
            - review: 커플의 취향 총평(한국어, 두 문장 이내).
            - nextRecommendation.area: 다음에 가볼 만한 동네/지역 이름 하나.
            - nextRecommendation.reason: 그 지역을 추천하는 이유(한 문장, 한국어).

            [럽슐랭 인증 장소]
            %s
            """;

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "review", Map.of("type", "STRING"),
                    "nextRecommendation", Map.of(
                            "type", "OBJECT",
                            "properties", Map.of(
                                    "area", Map.of("type", "STRING"),
                                    "reason", Map.of("type", "STRING")),
                            "required", List.of("area", "reason"))),
            "required", List.of("review"));

    private final GeminiClient geminiClient;
    private final PlaceRepository placeRepository;
    private final RelationRepository relationRepository;

    public LovelichelinReviewService(GeminiClient geminiClient, PlaceRepository placeRepository,
                                     RelationRepository relationRepository) {
        this.geminiClient = geminiClient;
        this.placeRepository = placeRepository;
        this.relationRepository = relationRepository;
    }

    public LovelichelinSummaryResponse summary(Long userId) {
        Relation couple = activeCouple(userId);
        List<Place> certified = placeRepository.findByCoupleIdOrderByIdDesc(couple.getId()).stream()
                .filter(p -> p.getLovelichelinTier() > 0)
                .toList();
        if (certified.size() < MIN_CERTIFIED_PLACES) {
            return LovelichelinSummaryResponse.empty();
        }

        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_LOVELICHELIN_REVIEW);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(PROMPT.formatted(describe(certified)))), SCHEMA);

        String review = result.path("review").asText("");
        if (review.isBlank()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        JsonNode next = result.path("nextRecommendation");
        NextRecommendation recommendation = next.path("area").asText("").isBlank()
                ? null
                : new NextRecommendation(next.path("area").asText(), next.path("reason").asText(null));
        return new LovelichelinSummaryResponse(true, review, recommendation);
    }

    private String describe(List<Place> places) {
        return places.stream()
                .map(p -> "- " + p.getName()
                        + (p.getCategory() != null ? " [" + p.getCategory() + "]" : "")
                        + " · 럽스타 " + p.getLovelichelinTier() + "개")
                .collect(Collectors.joining("\n"));
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }
}
