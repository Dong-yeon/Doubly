package com.fitto.place.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

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
    private final TransactionTemplate tx;
    private final CoupleEventPublisher coupleEventPublisher;

    public PlaceService(PlaceRepository placeRepository,
                        PlaceVisitRepository placeVisitRepository,
                        PlaceRatingRepository placeRatingRepository,
                        RelationRepository relationRepository,
                        UserRepository userRepository,
                        MealRepository mealRepository,
                        NotificationService notificationService,
                        PlanGuard planGuard,
                        FeedReactionRepository feedReactionRepository,
                        KakaoLocalClient kakaoLocalClient,
                        PlatformTransactionManager transactionManager,
                        CoupleEventPublisher coupleEventPublisher) {
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
        this.tx = new TransactionTemplate(transactionManager);
        this.coupleEventPublisher = coupleEventPublisher;
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
                        k.id(), k.name(), k.address(), k.category(), k.lat(), k.lng(), k.placeUrl(),
                        k.categoryDetail(), k.phone(), PlaceLinks.detailUrl(k.id())))
                .toList();
        return new PlaceSearchResponse(true, results);
    }

    /**
     * 장소 등록 (PLACE-01) — 이미 같은 커플이 등록해둔 장소면 새로 만들지 않고 그 장소를
     * 그대로 돌려준다({@link #findExisting}). 식단 기록 화면처럼 카카오 검색 결과를 그대로
     * 저장하는 경로에서, 이미 등록된 맛집을 다시 검색해 추가할 때 똑같은 장소가 중복
     * 생성되던 문제를 막는다. 재사용일 때는 플랜 한도({@link Feature#PLACE_PIN})도
     * 소모하지 않는다 — 실제로 늘어난 핀이 없으므로.
     *
     * <p>응답의 {@code created} 로 둘을 가른다 — 화면이 중복일 때 "추가했어요" 대신 "이미 럽슐랭에
     * 있어요"를 띄운다.
     *
     * <p><b>동시 저장</b>: 두 사람이 같은 카카오 장소를 거의 동시에 담으면 둘 다 "없다"를 보고 넣으려
     * 한다. 늦은 쪽은 {@code UNIQUE (couple_id, kakao_place_id)}(V117)에 막힌다. {@code ON CONFLICT}
     * 는 쓸 수 없으므로(CLAUDE.md 4절) 그 위반을 잡아 <b>새 트랜잭션에서</b> 먼저 들어간 행을 돌려준다 —
     * 같은 트랜잭션은 이미 롤백 표시가 붙어 다시 쓸 수 없다({@code JournalService.save} 와 같은 이유).
     * 그래서 이 메서드는 스스로 트랜잭션을 열지 않는다(클래스 기본값 readOnly 도 끈다).
     *
     * <p><b>SUPPORTS 인 이유</b>: 바깥 트랜잭션이 있으면 거기에 합류한다. NOT_SUPPORTED 로 바깥을 끊으면 호출자가
     * 아직 커밋하지 않은 데이터(방금 만든 커플 등)가 보이지 않는다 — 처음엔 그렇게 했다가 바깥 트랜잭션 안에서
     * save 를 부르는 테스트 6건이 "커플 연결 후 사용할 수 있는 기능"으로 깨졌다. 운영의 호출자는 컨트롤러뿐이라
     * 바깥 트랜잭션이 없고, 경합 재시도는 그 경우에 동작한다. 바깥 트랜잭션 안에서 경합이 나면 예전처럼 실패한다.
     */
    @Transactional(propagation = Propagation.SUPPORTS, readOnly = false)
    public PlaceResponse save(Long userId, SavePlaceRequest request) {
        try {
            Saved saved = tx.execute(status -> saveOnce(userId, request));
            if (Boolean.TRUE.equals(saved.response().created())) {
                // 커밋이 끝난 뒤에 알린다 — 상대 앱이 럽슐랭 목록 캐시를 비우고 다음에 다시 받는다
                coupleEventPublisher.publish(saved.coupleId(), CoupleEvent.PLACE);
            }
            return saved.response();
        } catch (DataIntegrityViolationException raced) {
            PlaceResponse winner = tx.execute(status -> {
                Place existing = findExisting(activeCouple(userId).getId(), request.kakaoPlaceId(),
                        request.name().trim(), request.address(), request.lat(), request.lng());
                return existing == null ? null : withSummary(existing, userId).withCreated(false);
            });
            if (winner == null) {
                throw raced;
            }
            return winner;
        }
    }

    private record Saved(PlaceResponse response, Long coupleId) {
    }

    private Saved saveOnce(Long userId, SavePlaceRequest request) {
        Relation couple = activeCouple(userId);
        String name = request.name().trim();

        Place existing = findExisting(couple.getId(), request.kakaoPlaceId(), name,
                request.address(), request.lat(), request.lng());
        if (existing != null) {
            return new Saved(withSummary(existing, userId).withCreated(false), couple.getId());
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
                .kakaoPlaceId(blankToNull(request.kakaoPlaceId()))
                .phone(blankToNull(request.phone()))
                .categoryDetail(blankToNull(request.categoryDetail()))
                .addedBy(userId)
                .build();
        // 즉시 INSERT — UNIQUE 위반이 커밋 시점이 아니라 여기서 터져야 위의 catch 가 받는다
        placeRepository.saveAndFlush(place);
        return new Saved(toResponse(place, null, RatingPair.EMPTY, null).withCreated(true), couple.getId());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
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
        PlaceVisit visit = createVisit(userId, place, request.visitedAt(), request.rating(), request.memo(),
                request.imageUrl(), request.mealId(), null, true);
        return PlaceVisitResponse.of(visit, userName(userId));
    }

    /**
     * 방문 한 건을 만든다 — {@link #recordVisit} 와 외식 기록({@link MealVisitService})이 같이 쓴다.
     *
     * <p>{@code notifyPartner=false} 는 외식 기록에서 식단 푸시가 장소 이름을 실어 대신 나갈 때다 — 외식 한 번에
     * 상대 폰이 두 번 울리던 것(식단 + 방문)을 한 번으로 줄인다(LOVEBODY_LOVELICHELIN_LINK §1-4).
     */
    @Transactional
    public PlaceVisit createVisit(Long userId, Place place, java.time.LocalDate visitedAt, Integer rating, String memo,
                           String imageUrl, Long mealId, String clientRequestId, boolean notifyPartner) {
        if (mealId != null) {
            boolean myMeal = mealRepository.findById(mealId)
                    .map(m -> userId.equals(m.getUserId()))
                    .orElse(false);
            if (!myMeal) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "내 식단 기록만 연동할 수 있습니다.");
            }
            // 식단 하나에 방문 하나(V129 unique) — 인덱스에 맡기면 500 이라 먼저 말한다
            if (!placeVisitRepository.findByMealIdIn(List.of(mealId)).isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 장소가 연결된 식단이에요.");
            }
        }
        // 다녀온 날은 미래일 수 없다 — 식단 저장과 같은 기준(KST). 예전엔 방문만 검사가 없었다
        if (visitedAt != null && visitedAt.isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }

        PlaceVisit visit = PlaceVisit.builder()
                .placeId(place.getId())
                .visitedBy(userId)
                .visitedAt(visitedAt)
                .rating(rating)
                .memo(memo)
                .imageUrl(imageUrl)
                .mealId(mealId)
                .clientRequestId(clientRequestId)
                .build();
        placeVisitRepository.save(visit);
        publishVisitChanged(place.getCoupleId());

        Long partnerId = notifyPartner ? activeCouple(userId).partnerOf(userId) : null;
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "새 맛집 방문 기록!",
                    userName(userId) + " — " + place.getName()
                            + (visit.getRating() != null ? " ★" + visit.getRating() : ""),
                    PushLinks.place(place.getId()));
        }
        return visit;
    }

    /** 외식 기록이 방문을 붙일 장소 — 커플 장소인지 확인까지 */
    public Place couplePlace(Long userId, Long placeId) {
        return getCouplePlace(userId, placeId);
    }

    /** 방문 응답 조립(외식 기록 응답·재전송용) */
    public PlaceVisitResponse visitResponse(PlaceVisit visit) {
        return PlaceVisitResponse.of(visit, userName(visit.getVisitedBy()));
    }

    /** "여기서 먹은 것"에 보여 줄 음식 수 — 그 이상은 화면이 길어지기만 한다 */
    static final int MENU_MAX_ITEMS = 8;
    /** 대표 메뉴로 제안하는 최소 횟수 — 한 번 먹은 건 그날의 선택이지 그 집의 대표가 아니다 */
    static final int SIGNATURE_MIN_TIMES = 2;

    /**
     * 장소 상세 "여기서 먹은 것" + 대표 메뉴 제안(LOVEBODY_LOVELICHELIN_LINK P1-1). 대표 메뉴는 저장하지 않는다 —
     * 저장하려면 장소에 컬럼이 필요하고, 그건 태그(분위기·가격대) 백로그와 함께 정한다.
     */
    public com.fitto.place.dto.PlaceMenuResponse menu(Long userId, Long placeId) {
        getCouplePlace(userId, placeId);
        List<com.fitto.place.dto.PlaceMenuResponse.MenuItem> items = placeVisitRepository
                .countMenu(placeId, org.springframework.data.domain.PageRequest.of(0, MENU_MAX_ITEMS))
                .stream()
                .map(c -> new com.fitto.place.dto.PlaceMenuResponse.MenuItem(c.getName(), c.getTimes(), c.getLastDate()))
                .toList();
        List<String> signature = items.stream()
                .filter(i -> i.times() >= SIGNATURE_MIN_TIMES)
                .limit(3)
                .map(com.fitto.place.dto.PlaceMenuResponse.MenuItem::name)
                .toList();
        return new com.fitto.place.dto.PlaceMenuResponse(items, signature);
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
        Place place = getCouplePlace(userId, placeId);
        PlaceVisit visit = placeVisitRepository.findById(visitId)
                .filter(v -> placeId.equals(v.getPlaceId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "방문 기록을 찾을 수 없습니다."));
        if (!userId.equals(visit.getVisitedBy())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 남긴 방문 기록만 삭제할 수 있습니다.");
        }
        // 피드 카드 응원 반응 — 다형 참조라 FK 가 없어 직접 지운다 (V60 주석 참고)
        feedReactionRepository.deleteByTargetTypeAndTargetId(FeedItemType.PLACE_VISIT, visitId);
        placeVisitRepository.delete(visit);
        publishVisitChanged(place.getCoupleId());
    }

    /**
     * 방문 기록이 바뀌었음을 상대 앱에 알린다 — 열려 있는 캘린더의 "다녀온 곳"과 럽슐랭 목록이
     * 다시 받는다. 장소 저장({@link #save})과 같은 {@code PLACE} 이벤트를 쓴다: 받는 쪽이 하는 일
     * (목록 다시 받기)이 같아서 종류를 늘릴 이유가 없다.
     *
     * <p>커밋 뒤에 보내는 일은 이제 발행기가 한다({@link CoupleEventPublisher} 주석) — 여기서 따로
     * afterCommit 을 걸면 그 콜백 안에서 발행기가 다시 예약해 이벤트가 사라진다.
     */
    private void publishVisitChanged(Long coupleId) {
        coupleEventPublisher.publish(coupleId, CoupleEvent.PLACE);
    }

    /**
     * 럽슐랭 대표 평점 등록/수정 — 장소당 한 사람당 1개만 유지되며 재평가 시 덮어쓴다.
     * 두 사람 평점이 모두 모이면 등급(tier)을 재산정하고, 새로 등극했을 때만 상대에게 알린다.
     * 상대가 아직 평가 전이면 <b>내 첫 평가 때 한 번만</b> 재촉 푸시를 보낸다.
     */
    @Transactional
    public PlaceResponse rate(Long userId, Long placeId, RatePlaceRequest request) {
        return rate(userId, placeId, request, true);
    }

    /**
     * 외식 기록의 평점 — 결정 Q3(2026-10-05): <b>내 대표 평점이 아직 없을 때만</b> 방문 별점으로 채운다. 이미 있으면
     * 건드리지 않는다("오늘은 별로였다"가 등급을 내리지 않게). 재방문 의사만 왔으면 그것만 고친다.
     *
     * <p>{@code nudgePartner=false} — "평가를 기다려요" 재촉은 외식 기록의 식단 푸시 문구가 대신 말한다(푸시 한 번).
     * 등극 푸시는 드물고 따로 알릴 가치가 있어 그대로 보낸다.
     *
     * @return 평점을 새로 매겼으면 그 결과, 아니면 null
     */
    @Transactional
    public PlaceResponse rateIfUnrated(Long userId, Long placeId, Integer rating, Boolean revisitIntent) {
        PlaceRating mine = placeRatingRepository.findByPlaceIdAndUserId(placeId, userId).orElse(null);
        if (mine != null) {
            if (revisitIntent != null) {
                mine.update(mine.getRating(), revisitIntent);
            }
            return null;
        }
        if (rating == null) {
            return null;
        }
        return rate(userId, placeId, new RatePlaceRequest(rating, revisitIntent), false);
    }

    /** 장소 응답(요약·평점·커버 포함) — 외식 기록 응답용 */
    public PlaceResponse placeResponse(Long userId, Long placeId) {
        return withSummary(getCouplePlace(userId, placeId), userId);
    }

    private PlaceResponse rate(Long userId, Long placeId, RatePlaceRequest request, boolean nudgePartner) {
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
        if (nudgePartner && firstRating && pair.partner() == null) {
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
