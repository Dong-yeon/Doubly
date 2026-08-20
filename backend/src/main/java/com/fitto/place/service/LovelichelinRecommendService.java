package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceDietTag;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.dto.LovelichelinRecommendationResponse;
import com.fitto.place.dto.LovelichelinRecommendationResponse.RecommendedPlace;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.service.KakaoLocalClient.KakaoPlace;
import com.fitto.place.service.PlaceService.RatingPair;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * AI 맛집 추천 — 럽슐랭 인증 장소(둘 다 만족한 취향 데이터)를 Gemini 에 보내
 * <b>검색 의도</b>(지역+메뉴 검색어, 추천 이유)를 만들고, 실존 장소는 카카오 로컬 검색으로
 * 조회해 조립한다. 구 "AI 총평"의 대체 — 재치있는 총평 한 줄은 greeting 으로 흡수됐다.
 *
 * <p><b>왜 두 단계인가</b>: LLM 에게 가게 이름을 직접 물으면 폐업/실존하지 않는 곳을
 * 지어낸다. 이름·주소·좌표는 전부 카카오 응답에서만 오고, AI 는 취향 분석과 이유만 쓴다
 * — {@link DateCourseService} 의 "목록에 없는 장소는 만들지 않습니다"와 같은 원칙의 확장.
 */
@Service
@Transactional(readOnly = true)
public class LovelichelinRecommendService {

    private static final int MIN_CERTIFIED_PLACES = 1;
    /** 검색어당 최대 채택 수 — 한 검색이 결과를 독식하지 않게 (다양성) */
    private static final int MAX_PER_SEARCH = 2;
    /** 추천 총 개수 상한 — 모달에서 스크롤 없이 훑을 수 있는 정도 */
    private static final int MAX_TOTAL = 6;

    private static final String PROMPT = """
            아래는 한 커플이 함께 검증해 '럽슐랭'으로 인증한(둘 다 만족한) 장소들과 평가입니다.
            이 커플의 취향을 분석해 주세요.
            - greeting: 커플의 미식/데이트 취향에 대한 다정하고 위트있는 총평(한국어, 두 문장 이내).
            - searches: 이 커플이 새로 가볼 만한 곳을 찾기 위한 지도 검색어 2~3개.
              - query: "지역(동네) + 음식 종류나 분위기" 형태의 짧은 검색어
                (예: "연남동 파스타", "성수동 조용한 브런치 카페").
                실제 가게 이름을 절대 지어내지 마세요 — 검색어만 만듭니다.
                지역은 커플이 다니는 동네 근처, 또는 취향에 맞을 만한 새로운 동네로 고릅니다.
              - reason: 이 검색을 추천하는 이유(커플 취향과 연결한 한 문장, 한국어).
            - 이미 목록에 있는 장소와 같은 곳을 다시 찾게 되는 검색어는 피합니다.

            [럽슐랭 인증 장소]
            %s
            """;

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "greeting", Map.of("type", "STRING"),
                    "searches", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "query", Map.of("type", "STRING"),
                                            "reason", Map.of("type", "STRING")),
                                    "required", List.of("query", "reason")))),
            "required", List.of("greeting", "searches"));

    private final GeminiClient geminiClient;
    private final KakaoLocalClient kakaoLocalClient;
    private final PlaceRepository placeRepository;
    private final PlaceRatingRepository placeRatingRepository;
    private final RelationRepository relationRepository;

    public LovelichelinRecommendService(GeminiClient geminiClient, KakaoLocalClient kakaoLocalClient,
                                        PlaceRepository placeRepository,
                                        PlaceRatingRepository placeRatingRepository,
                                        RelationRepository relationRepository) {
        this.geminiClient = geminiClient;
        this.kakaoLocalClient = kakaoLocalClient;
        this.placeRepository = placeRepository;
        this.placeRatingRepository = placeRatingRepository;
        this.relationRepository = relationRepository;
    }

    public LovelichelinRecommendationResponse recommend(Long userId) {
        Relation couple = activeCouple(userId);
        List<Place> all = placeRepository.findByCoupleIdOrderByIdDesc(couple.getId());
        List<Place> certified = all.stream()
                .filter(p -> p.getLovelichelinTier() > 0)
                .toList();
        if (certified.size() < MIN_CERTIFIED_PLACES) {
            return LovelichelinRecommendationResponse.empty();
        }
        // 카카오 키가 없으면 실존 장소를 못 구한다 — Gemini 한도를 차감하기 전에 먼저 확인
        if (!kakaoLocalClient.isConfigured()) {
            throw new BusinessException(ErrorCode.AI_NOT_CONFIGURED);
        }

        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_RESTAURANT_RECOMMEND);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(PROMPT.formatted(describe(certified, userId)))), SCHEMA);

        String greeting = result.path("greeting").asText("");
        if (greeting.isBlank()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }

        // 이미 저장한 장소는 재추천하지 않는다 — add() 반환값으로 추천 목록 내 중복도 함께 걸러진다
        Set<String> seenNames = all.stream()
                .map(p -> normalize(p.getName()))
                .collect(Collectors.toCollection(HashSet::new));

        List<RecommendedPlace> places = new ArrayList<>();
        for (JsonNode search : result.path("searches")) {
            String query = search.path("query").asText("");
            if (query.isBlank()) {
                continue;
            }
            String reason = search.path("reason").asText(null);
            int pickedBefore = places.size();
            for (KakaoPlace k : kakaoLocalClient.searchKeyword(query, 5)) {
                if (!seenNames.add(normalize(k.name()))) {
                    continue;
                }
                places.add(new RecommendedPlace(
                        k.name(), k.address(), k.category(), k.lat(), k.lng(), reason, k.placeUrl()));
                if (places.size() - pickedBefore >= MAX_PER_SEARCH) {
                    break;
                }
            }
            if (places.size() >= MAX_TOTAL) {
                break;
            }
        }
        // 카카오 검색이 전부 빈손이어도 greeting 은 유효하다 — 프론트가 "못 찾았어요"를 그린다
        return new LovelichelinRecommendationResponse(true, greeting, places);
    }

    /** 취향 프로필 — 이름·카테고리·지역(주소)·럽스타·둘의 평점·식단 성향까지 AI 에 준다 */
    private String describe(List<Place> certified, Long userId) {
        Map<Long, List<PlaceRating>> ratingsByPlace = placeRatingRepository
                .findByPlaceIdIn(certified.stream().map(Place::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(PlaceRating::getPlaceId));
        return certified.stream()
                .map(p -> {
                    RatingPair pair = PlaceService.ratingPairOf(
                            ratingsByPlace.getOrDefault(p.getId(), List.of()), userId);
                    return "- " + p.getName()
                            + (p.getCategory() != null ? " [" + p.getCategory() + "]" : "")
                            + (p.getAddress() != null ? " (" + p.getAddress() + ")" : "")
                            + " · 럽스타 " + p.getLovelichelinTier() + "개"
                            + (pair.mine() != null && pair.partner() != null
                                    ? " · 평점 " + pair.mine() + "점/" + pair.partner() + "점" : "")
                            + dietTagLabel(p.getDietTag());
                })
                .collect(Collectors.joining("\n"));
    }

    private static String dietTagLabel(PlaceDietTag tag) {
        return switch (tag) {
            case CLEAN -> " · 클린식";
            case CHEAT -> " · 치팅데이";
            case NEUTRAL -> "";
        };
    }

    /** 이름 대조용 정규화 — 공백·대소문자 차이로 같은 가게를 다른 곳으로 보지 않게 */
    private static String normalize(String name) {
        return name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }
}
