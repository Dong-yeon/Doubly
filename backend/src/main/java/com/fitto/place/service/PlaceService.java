package com.fitto.place.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.diet.repository.MealRepository;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.PlaceSearchResponse;
import com.fitto.place.dto.PlaceVisitResponse;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.dto.UpdatePlaceRequest;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitSummary;
import com.fitto.place.service.KakaoLocalClient.KakaoPlace;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 커플 맛집 지도 — PLAN.md Place Map. 장소는 커플(relations) 단위로 공유되며
 * 두 사람 모두 추가/수정/방문 기록이 가능하다.
 */
@Service
@Transactional(readOnly = true)
public class PlaceService {

    private final PlaceRepository placeRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final PlaceRatingRepository placeRatingRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final MealRepository mealRepository;
    private final NotificationService notificationService;
    private final PlanGuard planGuard;
    private final FeedReactionRepository feedReactionRepository;
    private final KakaoLocalClient kakaoLocalClient;

    public PlaceService(PlaceRepository placeRepository,
                        PlaceVisitRepository placeVisitRepository,
                        PlaceRatingRepository placeRatingRepository,
                        RelationRepository relationRepository,
                        UserRepository userRepository,
                        MealRepository mealRepository,
                        NotificationService notificationService,
                        PlanGuard planGuard,
                        FeedReactionRepository feedReactionRepository,
                        KakaoLocalClient kakaoLocalClient) {
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRatingRepository = placeRatingRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.mealRepository = mealRepository;
        this.notificationService = notificationService;
        this.planGuard = planGuard;
        this.feedReactionRepository = feedReactionRepository;
        this.kakaoLocalClient = kakaoLocalClient;
    }

    /**
     * 장소 이름 검색 — 카카오 로컬 키워드 검색을 그대로 위임한다(PLACE-01 신규 장소 추가의
     * "이름부터 찾기" 경로). 개수 자체는 {@link Feature#PLACE_PIN} 저장 시점에 걸리므로
     * 조회인 이 메서드는 게이팅하지 않는다 — {@link LovelichelinRecommendService}가 쓰는
     * Gemini 호출과 달리 외부 비용이 사실상 없는 단순 조회다.
     */
    public PlaceSearchResponse search(String query, int size) {
        if (!kakaoLocalClient.isConfigured() || query == null || query.isBlank()) {
            return PlaceSearchResponse.unavailable();
        }
        List<KakaoPlace> found = kakaoLocalClient.searchKeyword(query, Math.clamp(size, 1, 10));
        List<PlaceSearchResponse.PlaceSearchResult> results = found.stream()
                .map(k -> new PlaceSearchResponse.PlaceSearchResult(
                        k.id(), k.name(), k.address(), k.category(), k.lat(), k.lng(), k.placeUrl()))
                .toList();
        return new PlaceSearchResponse(true, results);
    }

    /**
     * 장소 등록 (PLACE-01) — 이미 같은 커플이 등록해둔 장소면 새로 만들지 않고 그 장소를
     * 그대로 돌려준다({@link #findExisting}). 식단 기록 화면처럼 카카오 검색 결과를 그대로
     * 저장하는 경로에서, 이미 등록된 맛집을 다시 검색해 추가할 때 똑같은 장소가 중복
     * 생성되던 문제를 막는다. 재사용일 때는 플랜 한도({@link Feature#PLACE_PIN})도
     * 소모하지 않는다 — 실제로 늘어난 핀이 없으므로.
     */
    @Transactional
    public PlaceResponse save(Long userId, SavePlaceRequest request) {
        Relation couple = activeCouple(userId);
        String name = request.name().trim();

        Place existing = findExisting(couple.getId(), request.kakaoPlaceId(), name,
                request.address(), request.lat(), request.lng());
        if (existing != null) {
            return withSummary(existing, userId);
        }

        planGuard.requireCapacity(userId, Feature.PLACE_PIN,
                placeRepository.countByCoupleId(couple.getId()));
        Place place = Place.builder()
                .coupleId(couple.getId())
                .name(name)
                .address(request.address())
                .lat(request.lat())
                .lng(request.lng())
                .category(request.category())
                .kakaoPlaceId(request.kakaoPlaceId())
                .addedBy(userId)
                .build();
        placeRepository.save(place);
        return toResponse(place, null, RatingPair.EMPTY, null);
    }

    /**
     * kakaoPlaceId 가 있으면 그걸로, 없으면(직접 입력·과거 데이터) 이름+좌표 또는
     * 이름+주소로 이미 등록된 장소를 찾는다. 우선순위: kakaoPlaceId &gt; 이름+좌표 &gt;
     * 이름+주소 — 뒤로 갈수록 대조 근거가 약해지므로 앞에서 못 찾았을 때만 진행한다.
     */
    private Place findExisting(Long coupleId, String kakaoPlaceId, String name,
                               String address, BigDecimal lat, BigDecimal lng) {
        if (kakaoPlaceId != null && !kakaoPlaceId.isBlank()) {
            Place byKakaoId = placeRepository.findFirstByCoupleIdAndKakaoPlaceId(coupleId, kakaoPlaceId)
                    .orElse(null);
            if (byKakaoId != null) {
                return byKakaoId;
            }
        }
        if (lat != null && lng != null) {
            Place byCoord = placeRepository
                    .findFirstByCoupleIdAndNameIgnoreCaseAndLatAndLng(coupleId, name, lat, lng)
                    .orElse(null);
            if (byCoord != null) {
                return byCoord;
            }
        }
        return placeRepository.findFirstByCoupleIdAndNameIgnoreCaseAndAddress(coupleId, name, address)
                .orElse(null);
    }

    /** 커플 공유 장소 목록 — 방문 요약 + 럽슐랭 평가 + 매거진 카드용 커버 포함 (PLACE-02) */
    public List<PlaceResponse> list(Long userId) {
        Relation couple = activeCouple(userId);
        List<Place> places = placeRepository.findByCoupleIdOrderByIdDesc(couple.getId());
        if (places.isEmpty()) {
            return List.of();
        }
        List<Long> placeIds = places.stream().map(Place::getId).toList();
        Map<Long, VisitSummary> summaries = placeVisitRepository
                .summarize(placeIds)
                .stream()
                .collect(Collectors.toMap(VisitSummary::getPlaceId, Function.identity()));
        Map<Long, List<PlaceRating>> ratingsByPlace = placeRatingRepository.findByPlaceIdIn(placeIds)
                .stream()
                .collect(Collectors.groupingBy(PlaceRating::getPlaceId));
        // 장소별 최근 방문순으로 이미 정렬돼 온다(리포지토리 쿼리) — 그룹핑해도 그룹 내 순서는 유지된다
        Map<Long, List<PlaceVisit>> visitsByPlace = placeVisitRepository
                .findByPlaceIdInOrderByPlaceIdAscIdDesc(placeIds)
                .stream()
                .collect(Collectors.groupingBy(PlaceVisit::getPlaceId));
        return places.stream()
                .map(p -> toResponse(p, summaries.get(p.getId()),
                        ratingPairOf(ratingsByPlace.getOrDefault(p.getId(), List.of()), userId),
                        coverOf(visitsByPlace.getOrDefault(p.getId(), List.of()))))
                .toList();
    }

    /** 장소 단건 조회 — 상세 화면 정보 카드 */
    public PlaceResponse get(Long userId, Long placeId) {
        return withSummary(getCouplePlace(userId, placeId), userId);
    }

    /** 장소 수정 — 커플 둘 다 가능 (PLACE-03) */
    @Transactional
    public PlaceResponse update(Long userId, Long placeId, UpdatePlaceRequest request) {
        Place place = getCouplePlace(userId, placeId);
        place.update(request.name(), request.address(), request.lat(), request.lng(), request.category());
        return withSummary(place, userId);
    }

    /** 장소 삭제 — 방문 기록도 함께 삭제(DB ON DELETE CASCADE) */
    @Transactional
    public void delete(Long userId, Long placeId) {
        Place place = getCouplePlace(userId, placeId);
        // 장소를 지우면 그 장소의 방문 기록도 사라진다 — 그 카드에 달렸던 반응까지 함께
        feedReactionRepository.deleteByTargetTypeAndTargetIdIn(FeedItemType.PLACE_VISIT,
                placeVisitRepository.findByPlaceIdOrderByIdDesc(placeId).stream()
                        .map(PlaceVisit::getId).toList());
        placeRepository.delete(place);
    }

    /** 방문 기록 추가 — 상대에게 푸시 (PLACE-04) */
    @Transactional
    public PlaceVisitResponse recordVisit(Long userId, Long placeId, RecordVisitRequest request) {
        Place place = getCouplePlace(userId, placeId);
        if (request.mealId() != null) {
            boolean myMeal = mealRepository.findById(request.mealId())
                    .map(m -> userId.equals(m.getUserId()))
                    .orElse(false);
            if (!myMeal) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "내 식단 기록만 연동할 수 있습니다.");
            }
        }

        PlaceVisit visit = PlaceVisit.builder()
                .placeId(place.getId())
                .visitedBy(userId)
                .visitedAt(request.visitedAt())
                .rating(request.rating())
                .memo(request.memo())
                .imageUrl(request.imageUrl())
                .mealId(request.mealId())
                .build();
        placeVisitRepository.save(visit);

        Long partnerId = activeCouple(userId).partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "새 맛집 방문 기록!",
                    userName(userId) + " — " + place.getName()
                            + (visit.getRating() != null ? " ★" + visit.getRating() : ""),
                    PushLinks.place(place.getId()));
        }
        return PlaceVisitResponse.of(visit, userName(userId));
    }

    /** 장소의 방문 기록 목록 (PLACE-05) */
    public List<PlaceVisitResponse> visits(Long userId, Long placeId) {
        getCouplePlace(userId, placeId);
        return placeVisitRepository.findByPlaceIdOrderByIdDesc(placeId).stream()
                .map(v -> PlaceVisitResponse.of(v, userName(v.getVisitedBy())))
                .toList();
    }

    /** 방문 기록 삭제 — 기록한 본인만 */
    @Transactional
    public void deleteVisit(Long userId, Long placeId, Long visitId) {
        getCouplePlace(userId, placeId);
        PlaceVisit visit = placeVisitRepository.findById(visitId)
                .filter(v -> placeId.equals(v.getPlaceId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "방문 기록을 찾을 수 없습니다."));
        if (!userId.equals(visit.getVisitedBy())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 남긴 방문 기록만 삭제할 수 있습니다.");
        }
        // 피드 카드 응원 반응 — 다형 참조라 FK 가 없어 직접 지운다 (V60 주석 참고)
        feedReactionRepository.deleteByTargetTypeAndTargetId(FeedItemType.PLACE_VISIT, visitId);
        placeVisitRepository.delete(visit);
    }

    /**
     * 럽슐랭 대표 평점 등록/수정 — 장소당 한 사람당 1개만 유지되며 재평가 시 덮어쓴다.
     * 두 사람 평점이 모두 모이면 등급(tier)을 재산정하고, 새로 등극했을 때만 상대에게 알린다.
     * 상대가 아직 평가 전이면 <b>내 첫 평가 때 한 번만</b> 재촉 푸시를 보낸다.
     */
    @Transactional
    public PlaceResponse rate(Long userId, Long placeId, RatePlaceRequest request) {
        Place place = getCouplePlace(userId, placeId);

        PlaceRating mine = placeRatingRepository.findByPlaceIdAndUserId(placeId, userId)
                .orElse(null);
        // 재촉 푸시의 스팸 방지 — 별점만 고쳐 다시 저장하는 재평가는 첫 평가가 아니므로
        // 상대에게 다시 보내지 않는다 (별도 상태 없이 upsert 분기로 자연스럽게 1회 보장).
        boolean firstRating = mine == null;
        if (mine == null) {
            mine = PlaceRating.builder()
                    .placeId(placeId)
                    .userId(userId)
                    .rating(request.rating())
                    .revisitIntent(request.revisitIntent())
                    .build();
            placeRatingRepository.save(mine);
        } else {
            mine.update(request.rating(), request.revisitIntent());
        }

        List<PlaceRating> ratings = placeRatingRepository.findByPlaceId(placeId);
        RatingPair pair = ratingPairOf(ratings, userId);

        int previousTier = place.getLovelichelinTier();
        int newTier = computeTier(pair.mine(), pair.partner());
        if (newTier != previousTier) {
            // certifiedAt 은 "0→양수로 처음 등극한 시각"이다. 1↔2↔3 사이를 오가는 재평가는
            // 등급이 바뀌어도 새로 등극한 게 아니므로 시각을 갱신하거나 알리지 않는다 —
            // 그렇지 않으면 3→2로 재평가만 해도 "새로 등극!" 알림이 잘못 나가고 등극일이
            // 오늘로 밀린다.
            if (previousTier == 0 && newTier > 0) {
                place.applyLovelichelinTier(newTier, LocalDateTime.now());
                Long partnerId = activeCouple(userId).partnerOf(userId);
                if (partnerId != null) {
                    notificationService.notify(partnerId, NotificationCategory.PARTNER,
                            "럽슐랭 " + newTier + "스타 등극! 🎉",
                            place.getName() + "이(가) 우리 둘의 럽슐랭으로 인증됐어요.",
                            PushLinks.place(place.getId()));
                }
            } else if (newTier == 0) {
                place.applyLovelichelinTier(0, null);
            } else {
                place.applyLovelichelinTier(newTier, place.getLovelichelinCertifiedAt());
            }
        }

        // 등급은 둘 다 평가해야 매겨지는데, 정작 상대는 내가 평가했다는 사실을 알 길이 없었다
        // ("상대 평가 대기 중" 문구는 내 화면에만 보인다) — 첫 평가 시 상대에게 차례를 알린다.
        // 등극 알림과는 상호배타적이다: 등극은 상대 평점이 있어야, 재촉은 없어야 나간다.
        if (firstRating && pair.partner() == null) {
            Long partnerId = activeCouple(userId).partnerOf(userId);
            if (partnerId != null) {
                notificationService.notify(partnerId, NotificationCategory.PARTNER, "럽슐랭 평가를 기다려요 ⭐",
                        userName(userId) + "이(가) " + place.getName()
                                + "에 별점을 남겼어요. 당신의 평점이 등급을 결정해요!",
                        PushLinks.place(place.getId()));
            }
        }

        VisitSummary s = placeVisitRepository.summarize(List.of(placeId)).stream().findFirst().orElse(null);
        Cover cover = coverOf(placeVisitRepository.findByPlaceIdOrderByIdDesc(placeId));
        return toResponse(place, s, pair, cover);
    }

    // ---- helpers ----

    /** 방문 요약·평점·커버를 한 곳에서만 PlaceResponse 로 조립한다 — list/get/update/rate/save 공통 */
    private PlaceResponse toResponse(Place place, VisitSummary s, RatingPair pair, Cover cover) {
        return PlaceResponse.of(place,
                s == null ? 0 : s.getVisitCount(),
                s == null ? null : s.getAvgRating(),
                s == null ? null : s.getLastVisitedAt(),
                pair.mine(), pair.partner(),
                cover == null ? null : cover.imageUrl(),
                cover == null ? null : cover.memo());
    }

    /** 럽슐랭 가이드 매거진 카드 커버 — 사진 있는 가장 최근 방문, 없으면 그냥 가장 최근 방문 */
    private Cover coverOf(List<PlaceVisit> visitsMostRecentFirst) {
        if (visitsMostRecentFirst.isEmpty()) {
            return null;
        }
        PlaceVisit withPhoto = visitsMostRecentFirst.stream()
                .filter(v -> v.getImageUrl() != null)
                .findFirst()
                .orElse(visitsMostRecentFirst.get(0));
        return new Cover(withPhoto.getImageUrl(), withPhoto.getMemo());
    }

    private record Cover(String imageUrl, String memo) {
    }

    /**
     * 럽슐랭 등급 산정 — 둘 다 평가해야 하고, 한쪽이라도 2점 이하면 탈락(0)이다.
     * 남은 조합은 두 점수 모두 3점 이상이라 평균이 항상 3.0 이상이다.
     */
    static int computeTier(Integer my, Integer partner) {
        if (my == null || partner == null) {
            return 0;
        }
        if (my <= 2 || partner <= 2) {
            return 0;
        }
        double avg = (my + partner) / 2.0;
        if (avg >= 5.0) {
            return 3;
        }
        if (avg >= 4.0) {
            return 2;
        }
        return 1;
    }

    /**
     * 평점 목록에서 나/상대 것을 갈라낸다 — {@link com.fitto.trip.service.TripService}도
     * 같은 나/상대 분리가 필요해 여기 public static 으로 둬서 재사용한다(패키지가 달라
     * 인스턴스 주입 없이도 쓸 수 있게).
     */
    public static RatingPair ratingPairOf(List<PlaceRating> ratings, Long userId) {
        Integer mine = null;
        Integer partner = null;
        for (PlaceRating r : ratings) {
            if (userId.equals(r.getUserId())) {
                mine = r.getRating();
            } else {
                partner = r.getRating();
            }
        }
        return new RatingPair(mine, partner);
    }

    public record RatingPair(Integer mine, Integer partner) {
        public static final RatingPair EMPTY = new RatingPair(null, null);
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private Place getCouplePlace(Long userId, Long placeId) {
        Place place = placeRepository.findById(placeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PLACE_NOT_FOUND));
        if (!place.getCoupleId().equals(activeCouple(userId).getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return place;
    }

    private PlaceResponse withSummary(Place place, Long userId) {
        VisitSummary s = placeVisitRepository.summarize(List.of(place.getId()))
                .stream().findFirst().orElse(null);
        RatingPair pair = ratingPairOf(placeRatingRepository.findByPlaceId(place.getId()), userId);
        Cover cover = coverOf(placeVisitRepository.findByPlaceIdOrderByIdDesc(place.getId()));
        return toResponse(place, s, pair, cover);
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
