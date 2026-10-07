package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.AiResultCache;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.content.domain.Content;
import com.fitto.content.domain.ContentRating;
import com.fitto.content.domain.ContentType;
import com.fitto.content.repository.ContentLogRepository;
import com.fitto.content.repository.ContentLogRepository.LogSummary;
import com.fitto.content.repository.ContentRatingRepository;
import com.fitto.content.repository.ContentRepository;
import com.fitto.content.service.ContentService;
import com.fitto.content.service.TmdbClient;
import com.fitto.content.service.TmdbClient.NowPlaying;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.dto.DateCourseOptions;
import com.fitto.place.dto.DateCourseOptions.CourseType;
import com.fitto.place.dto.DateCourseResponse;
import com.fitto.place.dto.DateCourseResponse.Stop;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitSummary;
import com.fitto.place.service.DateCourseInput.ContentCandidate;
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
 * AI 데이트 코스 추천 — 커플이 저장한 장소(places)·콘텐츠(contents)를 Gemini 에 보내 순서 있는 코스를 받는다.
 * 코스 유형: 밖에서(장소만) / 영화·공연(보고 싶은 작품 1 + 장소 1~2) / 집콕(드라마·영화 + 포장해 올 곳 0~1).
 * 장소·콘텐츠는 테이블도 화면도 합치지 않는다 — 여기서 후보로만 함께 놓는다. 설계: docs/LOVELICHELIN_AI_COURSE_2026-10-07.md.
 *
 * <p>입력은 이름·카테고리·주소만이 아니라 방문(관람) 여부·횟수·마지막 방문일·나/상대 평점·등급·세부 분류·가까운 곳까지 싣는다
 * (커플 단위 일괄 조회 — 장소마다 따로 묻지 않는다). 2점 이하 제외·거리 계산·id 매칭·개수 규칙은 AI 가 아니라 서버가 한다
 * ({@link DateCourseInput}).
 *
 * <p><b>트랜잭션을 걸지 않는다</b> — 커넥션을 쥔 채 Gemini 를 기다리면 풀이 고갈된다.
 * 이유는 {@link com.fitto.diet.service.DietCoachService} 클래스 주석 참고.
 * 여기서도 조회(관계·장소·방문·평점·콘텐츠·상영작)는 전부 Gemini 호출 <b>전에</b> 끝나고, 이후에는 값 객체만 읽는다.
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
    private final ContentRepository contentRepository;
    private final ContentLogRepository contentLogRepository;
    private final ContentRatingRepository contentRatingRepository;
    private final TmdbClient tmdbClient;

    public DateCourseService(GeminiClient geminiClient, AiResultCache aiResultCache,
                             PlaceRepository placeRepository,
                             PlaceVisitRepository placeVisitRepository,
                             PlaceRatingRepository placeRatingRepository,
                             RelationRepository relationRepository,
                             ContentRepository contentRepository,
                             ContentLogRepository contentLogRepository,
                             ContentRatingRepository contentRatingRepository,
                             TmdbClient tmdbClient) {
        this.geminiClient = geminiClient;
        this.aiResultCache = aiResultCache;
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRatingRepository = placeRatingRepository;
        this.relationRepository = relationRepository;
        this.contentRepository = contentRepository;
        this.contentLogRepository = contentLogRepository;
        this.contentRatingRepository = contentRatingRepository;
        this.tmdbClient = tmdbClient;
    }

    /** 옛 호출 — 옵션 없이(밖에서·안 가본 곳 포함) */
    public DateCourseResponse recommend(Long userId, boolean refresh) {
        return recommend(userId, refresh, DateCourseOptions.defaults());
    }

    /**
     * @param refresh 사용자가 "다른 코스 추천"을 눌렀는가 — 캐시를 건너뛰고 새로 짠다.
     *                저장한 장소·옵션이 그대로면 {@link AiResultCache} 가 지난번 코스를 즉시 돌려준다.
     *                장소·방문·평점·콘텐츠가 바뀌면 입력 문자열이 달라져 자동으로 다시 짠다. 무료는 월 1회라
     *                화면에 들어갔다는 이유만으로 그 한 번이 소모되면 안 된다.
     */
    public DateCourseResponse recommend(Long userId, boolean refresh, DateCourseOptions options) {
        Relation couple = activeCouple(userId);
        CourseType type = options.type();
        List<PlaceCandidate> places = DateCourseInput.filterPlaces(placeCandidates(couple.getId(), userId), options);
        List<ContentCandidate> contents = type == CourseType.OUTDOOR
                ? List.of()
                : DateCourseInput.filterContents(contentCandidates(couple.getId(), userId, type), type);

        DateCourseResponse shortage = shortage(options, places, contents);
        if (shortage != null) {
            return shortage;
        }

        String input = DateCourseInput.prompt(options, places, contents);
        Map<String, PlaceCandidate> placesByRef = DateCourseInput.byRef(places);
        Map<String, ContentCandidate> contentsByRef = DateCourseInput.contentsByRef(contents);
        // 한도는 코스 유형과 무관하게 같은 기능 키(AI_DATE_COURSE) — 새 우회를 만들지 않는다
        return aiResultCache.remember(userId, Feature.AI_DATE_COURSE, input, refresh,
                DateCourseResponse.class, () -> generate(userId, input, placesByRef, contentsByRef, type));
    }

    /** 재료가 모자라면 이유를 담은 빈 응답(한도를 쓰지 않는다), 충분하면 null */
    static DateCourseResponse shortage(DateCourseOptions options, List<PlaceCandidate> places,
                                       List<ContentCandidate> contents) {
        return switch (options.type()) {
            case OUTDOOR -> places.size() >= MIN_PLACES ? null
                    : options.includeUnvisited()
                    ? DateCourseResponse.empty()
                    : DateCourseResponse.empty("다녀온 곳이 두 곳 이상 있어야 다녀온 곳만으로 코스를 짤 수 있어요. '안 가본 곳 포함'을 켜 보세요.");
            case MOVIE_SHOW -> contents.isEmpty()
                    ? DateCourseResponse.empty("보고 싶은 공연이나 지금 상영 중인 영화가 콘텐츠에 없어요. 콘텐츠에 담아 두면 코스에 넣어 드릴게요!")
                    : places.isEmpty()
                    ? DateCourseResponse.empty("영화·공연 전후로 들를 장소가 없어요. 가고 싶은 곳을 한 곳 이상 담아 주세요.")
                    : null;
            case HOME -> contents.isEmpty()
                    ? DateCourseResponse.empty("함께 볼 드라마·영화가 콘텐츠에 없어요. 보고 싶은 작품을 담아 두면 집콕 코스를 짜 드릴게요!")
                    : null;
        };
    }

    private DateCourseResponse generate(Long userId, String input, Map<String, PlaceCandidate> placesByRef,
                                        Map<String, ContentCandidate> contentsByRef, CourseType type) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_DATE_COURSE);
        JsonNode result = geminiClient.generateJsonInBackground(userId, Feature.AI_DATE_COURSE,
                List.of(GeminiClient.textPart(input)), SCHEMA);

        List<Stop> stops = DateCourseInput.toStops(result, placesByRef, contentsByRef, type);
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

    /**
     * 커플 콘텐츠 → 후보. 관람 요약·평점은 id 묶음으로 한 번씩(N+1 없음). 영화·공연 코스에서 영화가 있을 때만 TMDB 상영작을 묻는다 —
     * 대조가 애매한 영화(부분 일치)는 showing=false 로 두어 filterContents 가 뺀다.
     */
    List<ContentCandidate> contentCandidates(Long coupleId, Long userId, CourseType type) {
        List<Content> contents = contentRepository.findByCoupleIdOrderByIdDesc(coupleId);
        if (contents.isEmpty()) return List.of();
        List<Long> ids = contents.stream().map(Content::getId).toList();
        Map<Long, LogSummary> logs = contentLogRepository.summarize(ids).stream()
                .collect(Collectors.toMap(LogSummary::getContentId, Function.identity(), (a, b) -> a));
        Map<Long, List<ContentRating>> ratings = contentRatingRepository.findByContentIdIn(ids).stream()
                .collect(Collectors.groupingBy(ContentRating::getContentId));
        List<NowPlaying> nowPlaying = type == CourseType.MOVIE_SHOW
                && contents.stream().anyMatch(c -> c.getType() == ContentType.MOVIE)
                ? tmdbClient.nowPlaying() : List.of();
        return contents.stream().map(c -> {
            LogSummary l = logs.get(c.getId());
            ContentService.RatingPair pair = ContentService.ratingPairOf(ratings.getOrDefault(c.getId(), List.of()), userId);
            boolean showing = c.getType() == ContentType.MOVIE
                    && DateCourseInput.screening(c.getTitle(), nowPlaying) == DateCourseInput.Screening.SHOWING;
            return new ContentCandidate(c.getId(), c.getTitle(), c.getType().name(), c.getPosterUrl(),
                    l != null ? l.getLogCount() : 0, pair.mine(), pair.partner(),
                    c.getLovelichelinTier() != null ? c.getLovelichelinTier() : 0, showing);
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
