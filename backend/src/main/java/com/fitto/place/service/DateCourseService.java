package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.AiResultCache;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.dto.DateCourseOptions;
import com.fitto.place.dto.DateCourseResponse;
import com.fitto.place.dto.DateCourseResponse.Stop;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitSummary;
import com.fitto.place.service.DateCourseInput.PlaceCandidate;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * AI 데이트 코스 추천 — 커플이 저장한 장소(places)를 Gemini 에 보내 순서 있는 코스를 받는다.
 * 설계: docs/LOVELICHELIN_AI_COURSE_2026-10-07.md.
 *
 * <p>입력은 이름·카테고리·주소만이 아니라 방문 여부·횟수·마지막 방문일·나/상대 평점·등급·세부 분류·가까운 곳까지 싣는다
 * (커플 단위 일괄 조회 — 장소마다 따로 묻지 않는다). 2점 이하 제외·거리 계산·id 매칭은 AI 가 아니라 서버가 한다
 * ({@link DateCourseInput}).
 *
 * <p><b>트랜잭션을 걸지 않는다</b> — 커넥션을 쥔 채 Gemini 를 기다리면 풀이 고갈된다.
 * 이유는 {@link com.fitto.diet.service.DietCoachService} 클래스 주석 참고.
 * 여기서도 조회(관계·장소·방문·평점)는 전부 Gemini 호출 <b>전에</b> 끝나고, 이후에는 값 객체만 읽는다.
 */
@Service
public class DateCourseService {

    private static final int MIN_PLACES = 2;

    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "stops", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "ref", Map.of("type", "STRING"),
                                            "reason", Map.of("type", "STRING")),
                                    "required", List.of("ref", "reason"))),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("stops"));

    private final GeminiClient geminiClient;
    private final AiResultCache aiResultCache;
    private final PlaceRepository placeRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final PlaceRatingRepository placeRatingRepository;
    private final RelationRepository relationRepository;

    public DateCourseService(GeminiClient geminiClient, AiResultCache aiResultCache,
                             PlaceRepository placeRepository,
                             PlaceVisitRepository placeVisitRepository,
                             PlaceRatingRepository placeRatingRepository,
                             RelationRepository relationRepository) {
        this.geminiClient = geminiClient;
        this.aiResultCache = aiResultCache;
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRatingRepository = placeRatingRepository;
        this.relationRepository = relationRepository;
    }

    /** 옛 호출 — 옵션 없이(밖에서·안 가본 곳 포함) */
    public DateCourseResponse recommend(Long userId, boolean refresh) {
        return recommend(userId, refresh, DateCourseOptions.defaults());
    }

    /**
     * @param refresh 사용자가 "다른 코스 추천"을 눌렀는가 — 캐시를 건너뛰고 새로 짠다.
     *                저장한 장소·옵션이 그대로면 {@link AiResultCache} 가 지난번 코스를 즉시 돌려준다.
     *                장소·방문·평점이 바뀌면 입력 문자열이 달라져 자동으로 다시 짠다. 무료는 월 1회라
     *                화면에 들어갔다는 이유만으로 그 한 번이 소모되면 안 된다.
     */
    public DateCourseResponse recommend(Long userId, boolean refresh, DateCourseOptions options) {
        Relation couple = activeCouple(userId);
        List<PlaceCandidate> places = DateCourseInput.filterPlaces(placeCandidates(couple.getId(), userId),
                options.includeUnvisited());
        if (places.size() < MIN_PLACES) {
            return options.includeUnvisited()
                    ? DateCourseResponse.empty()
                    : DateCourseResponse.empty("다녀온 곳이 두 곳 이상 있어야 다녀온 곳만으로 코스를 짤 수 있어요. '안 가본 곳 포함'을 켜 보세요.");
        }

        String input = DateCourseInput.prompt(options, places);
        Map<String, PlaceCandidate> byRef = DateCourseInput.byRef(places);
        return aiResultCache.remember(userId, Feature.AI_DATE_COURSE, input, refresh,
                DateCourseResponse.class, () -> generate(userId, input, byRef));
    }

    private DateCourseResponse generate(Long userId, String input, Map<String, PlaceCandidate> byRef) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_DATE_COURSE);
        JsonNode result = geminiClient.generateJsonInBackground(userId, Feature.AI_DATE_COURSE,
                List.of(GeminiClient.textPart(input)), SCHEMA);

        List<Stop> stops = DateCourseInput.toStops(result, byRef);
        if (stops.isEmpty()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        return new DateCourseResponse(true, stops, result.path("comment").asText(null));
    }

    /**
     * 커플 장소 → 후보. 방문 요약·평점은 장소 id 묶음으로 한 번씩만 묻는다(N+1 없음) — PlaceService.list 와 같은 방식.
     */
    List<PlaceCandidate> placeCandidates(Long coupleId, Long userId) {
        List<Place> places = placeRepository.findByCoupleIdOrderByIdDesc(coupleId);
        if (places.isEmpty()) return List.of();
        List<Long> ids = places.stream().map(Place::getId).toList();
        Map<Long, VisitSummary> visits = placeVisitRepository.summarize(ids).stream()
                .collect(Collectors.toMap(VisitSummary::getPlaceId, Function.identity(), (a, b) -> a));
        Map<Long, List<PlaceRating>> ratings = placeRatingRepository.findByPlaceIdIn(ids).stream()
                .collect(Collectors.groupingBy(PlaceRating::getPlaceId));
        return places.stream().map(p -> {
            VisitSummary v = visits.get(p.getId());
            PlaceService.RatingPair pair = PlaceService.ratingPairOf(ratings.getOrDefault(p.getId(), List.of()), userId);
            return new PlaceCandidate(p.getId(), p.getName(), p.getCategory(), p.getCategoryDetail(), p.getAddress(),
                    p.getLat() != null ? p.getLat().doubleValue() : null,
                    p.getLng() != null ? p.getLng().doubleValue() : null,
                    v != null ? v.getVisitCount() : 0, v != null ? v.getLastVisitedAt() : null,
                    pair.mine(), pair.partner(),
                    p.getLovelichelinTier() != null ? p.getLovelichelinTier() : 0);
        }).toList();
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }
}
