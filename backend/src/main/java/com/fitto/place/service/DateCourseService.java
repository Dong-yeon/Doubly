package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.place.domain.Place;
import com.fitto.place.dto.DateCourseResponse;
import com.fitto.place.dto.DateCourseResponse.Stop;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI 데이트 코스 추천 — 커플이 저장한 맛집/장소(places)를 Gemini 에 보내
 * 자연스러운 순서의 데이트 코스를 제안받는다. 최근 만든 place 데이터를 활용한다.
 */
@Service
@Transactional(readOnly = true)
public class DateCourseService {

    private static final int MIN_PLACES = 2;

    private static final String PROMPT = """
            아래는 한 커플이 저장한 장소 목록입니다. 이 중에서 골라 오늘 즐길 수 있는
            자연스러운 데이트 코스를 짜주세요.
            - stops: 방문 순서대로 2~4곳. 각 stop 은 목록에 있는 name 을 그대로 쓰고,
              category 와 reason(이 순서에 넣은 이유, 한 문장 한국어)을 채웁니다.
            - 동선과 시간대(식사→카페→산책 등)를 고려해 흐름이 자연스럽게 구성합니다.
            - 목록에 없는 장소는 만들지 않습니다.
            - comment: 이 코스에 대한 다정한 한 줄 소개(한국어).

            [저장된 장소]
            %s
            """;

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "stops", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "name", Map.of("type", "STRING"),
                                            "category", Map.of("type", "STRING"),
                                            "reason", Map.of("type", "STRING")),
                                    "required", List.of("name", "reason"))),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("stops"));

    private final GeminiClient geminiClient;
    private final PlaceRepository placeRepository;
    private final RelationRepository relationRepository;

    public DateCourseService(GeminiClient geminiClient, PlaceRepository placeRepository,
                             RelationRepository relationRepository) {
        this.geminiClient = geminiClient;
        this.placeRepository = placeRepository;
        this.relationRepository = relationRepository;
    }

    public DateCourseResponse recommend(Long userId) {
        Relation couple = activeCouple(userId);
        List<Place> places = placeRepository.findByCoupleIdOrderByIdDesc(couple.getId());
        if (places.size() < MIN_PLACES) {
            return DateCourseResponse.empty();
        }

        geminiClient.requireConfiguredAndCountUsage(userId);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(PROMPT.formatted(describe(places)))), SCHEMA);

        List<Stop> stops = new ArrayList<>();
        for (JsonNode s : result.path("stops")) {
            String name = s.path("name").asText("");
            if (name.isBlank()) continue;
            stops.add(new Stop(name, s.path("category").asText(null), s.path("reason").asText(null)));
        }
        if (stops.isEmpty()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        return new DateCourseResponse(true, stops, result.path("comment").asText(null));
    }

    private String describe(List<Place> places) {
        return places.stream()
                .map(p -> "- " + p.getName()
                        + (p.getCategory() != null ? " [" + p.getCategory() + "]" : "")
                        + (p.getAddress() != null ? " (" + p.getAddress() + ")" : "")
                        + " · " + (p.getStatus() == com.fitto.place.domain.PlaceStatus.VISITED ? "방문함" : "가고싶음"))
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
