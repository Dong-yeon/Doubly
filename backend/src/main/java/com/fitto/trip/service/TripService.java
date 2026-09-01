package com.fitto.trip.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitSummary;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trip.domain.Trip;
import com.fitto.trip.domain.TripItem;
import com.fitto.trip.dto.ReorderTripItemsRequest;
import com.fitto.trip.dto.SaveTripItemRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripDayResponse;
import com.fitto.trip.dto.TripDetailResponse;
import com.fitto.trip.dto.TripItemResponse;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.dto.UpdateTripItemRequest;
import com.fitto.trip.dto.UpdateTripRequest;
import com.fitto.trip.repository.TripItemRepository;
import com.fitto.trip.repository.TripRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 커플 여행 — PLAN.md Trip. 맛집 지도(places)의 확장으로, 장소 핀을
 * 여행 단위로 그룹핑한다. 커플 둘 다 생성/수정/장소 담기가 가능하다.
 */
@Service
@Transactional(readOnly = true)
public class TripService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("M월 d일");

    /** AI 일정 생성 응답 스키마 — days[dayNo, stops[startTime, title, category, placeName, reason]]. */
    private static final Map<String, Object> ITINERARY_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "days", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "dayNo", Map.of("type", "INTEGER"),
                                            "stops", Map.of(
                                                    "type", "ARRAY",
                                                    "items", Map.of(
                                                            "type", "OBJECT",
                                                            "properties", Map.of(
                                                                    "startTime", Map.of("type", "STRING"),
                                                                    "title", Map.of("type", "STRING"),
                                                                    "category", Map.of("type", "STRING"),
                                                                    "placeName", Map.of("type", "STRING"),
                                                                    "reason", Map.of("type", "STRING")),
                                                            "required", List.of("title")))),
                                    "required", List.of("dayNo", "stops"))),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("days"));

    private final TripRepository tripRepository;
    private final TripItemRepository tripItemRepository;
    private final PlaceRepository placeRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final PlaceRatingRepository placeRatingRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final GeminiClient geminiClient;
    private final PlanGuard planGuard;
    /** AI 일정의 DELETE+INSERT 만 트랜잭션으로 감싸는 협력자 — generateItinerary 주석 참고. */
    private final TripItineraryWriter tripItineraryWriter;

    public TripService(TripRepository tripRepository,
                       TripItemRepository tripItemRepository,
                       PlaceRepository placeRepository,
                       PlaceVisitRepository placeVisitRepository,
                       PlaceRatingRepository placeRatingRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       GeminiClient geminiClient,
                       PlanGuard planGuard,
                       TripItineraryWriter tripItineraryWriter) {
        this.tripRepository = tripRepository;
        this.tripItemRepository = tripItemRepository;
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRatingRepository = placeRatingRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.geminiClient = geminiClient;
        this.planGuard = planGuard;
        this.tripItineraryWriter = tripItineraryWriter;
    }

    /** 여행 생성 (TRIP-01) — 상대에게 푸시 + TRIP 이벤트. */
    @Transactional
    public TripResponse save(Long userId, SaveTripRequest request) {
        validateDates(request.startDate(), request.endDate());
        Relation couple = activeCouple(userId);
        planGuard.requireCapacity(userId, Feature.TRIP_ACTIVE,
                tripRepository.countByCoupleIdAndEndDateGreaterThanEqual(couple.getId(), KstClock.today()));
        Trip trip = Trip.builder()
                .coupleId(couple.getId())
                .title(request.title().trim())
                .startDate(request.startDate())
                .endDate(request.endDate())
                .memo(request.memo())
                .coverImageUrl(request.coverImageUrl())
                .createdBy(userId)
                .build();
        tripRepository.save(trip);

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "새 여행 계획",
                    userName(userId) + " — " + trip.getTitle()
                            + " (" + trip.getStartDate().format(DATE_FMT) + "~)",
                    PushLinks.trip(trip.getId()));
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
        return TripResponse.of(trip, 0);
    }

    /** 여행 목록 (TRIP-02) — startDate 최신순, 담긴 장소 수 포함. */
    public List<TripResponse> list(Long userId) {
        Relation couple = activeCouple(userId);
        return tripRepository.findByCoupleIdOrderByStartDateDescIdDesc(couple.getId()).stream()
                .map(t -> TripResponse.of(t, placeRepository.countByTripId(t.getId())))
                .toList();
    }

    /** 여행 상세 (TRIP-03) — Day별 일정표 + 담긴 장소 목록(방문 요약 포함). */
    public TripDetailResponse detail(Long userId, Long tripId) {
        Trip trip = getCoupleTrip(userId, tripId);
        List<Place> places = placeRepository.findByTripIdOrderByIdDesc(trip.getId());
        List<TripDayResponse> days = buildDays(trip);
        return new TripDetailResponse(TripResponse.of(trip, places.size()), days, withSummaries(places, userId));
    }

    /** 여행 수정 — 커플 둘 다 가능. */
    @Transactional
    public TripResponse update(Long userId, Long tripId, UpdateTripRequest request) {
        Trip trip = getCoupleTrip(userId, tripId);
        LocalDate start = request.startDate() != null ? request.startDate() : trip.getStartDate();
        LocalDate end = request.endDate() != null ? request.endDate() : trip.getEndDate();
        validateDates(start, end);
        trip.update(request.title(), request.startDate(), request.endDate(),
                request.memo(), request.coverImageUrl());
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
        return TripResponse.of(trip, placeRepository.countByTripId(trip.getId()));
    }

    /** 여행 삭제 — 담긴 장소는 연결만 해제(장소·방문 기록 유지). */
    @Transactional
    public void delete(Long userId, Long tripId) {
        Trip trip = getCoupleTrip(userId, tripId);
        placeRepository.findByTripIdOrderByIdDesc(trip.getId())
                .forEach(p -> p.assignTrip(null));
        tripRepository.delete(trip);
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
    }

    /** 장소 담기 (TRIP-04) — 다른 여행에 있던 장소면 이 여행으로 옮긴다. */
    @Transactional
    public void attachPlace(Long userId, Long tripId, Long placeId) {
        Trip trip = getCoupleTrip(userId, tripId);
        Place place = getCouplePlace(trip.getCoupleId(), placeId);
        place.assignTrip(trip.getId());
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
    }

    /** 장소 빼기 — 여행에서만 제거, 장소는 유지. */
    @Transactional
    public void detachPlace(Long userId, Long tripId, Long placeId) {
        Trip trip = getCoupleTrip(userId, tripId);
        Place place = getCouplePlace(trip.getCoupleId(), placeId);
        if (!trip.getId().equals(place.getTripId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이 여행에 담긴 장소가 아니에요.");
        }
        place.assignTrip(null);
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
    }

    /**
     * 여행 모드 토글 (PLAN.md Travel Mode) — 값을 계산·저장하지 않고 켜고 끄기만 한다.
     * 켜져 있고 오늘이 여행 기간 안이면 {@link com.fitto.diet.service.NutritionService} 가
     * 식단 목표를 숨긴다. 식단 대시보드도 즉시 갱신되도록 DIET_GOAL 이벤트를 함께 발행한다.
     */
    @Transactional
    public TripResponse setTravelMode(Long userId, Long tripId, boolean enabled) {
        Trip trip = getCoupleTrip(userId, tripId);
        trip.setTravelMode(enabled);
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.DIET_GOAL);
        return TripResponse.of(trip, placeRepository.countByTripId(trip.getId()));
    }

    // ---- 일자별 일정표 (Itinerary) ----

    /** 일정 목록 (ITEM-01) — Day별 그룹. */
    public List<TripDayResponse> items(Long userId, Long tripId) {
        Trip trip = getCoupleTrip(userId, tripId);
        return buildDays(trip);
    }

    /** 일정 항목 추가 (ITEM-02) — 하루 맨 뒤에 붙인다. 장소 연결은 선택. */
    @Transactional
    public TripItemResponse addItem(Long userId, Long tripId, SaveTripItemRequest request) {
        Trip trip = getCoupleTrip(userId, tripId);
        validateDayNo(trip, request.dayNo());
        Place place = request.placeId() != null
                ? getCouplePlace(trip.getCoupleId(), request.placeId()) : null;

        int nextOrder = tripItemRepository.findByTripIdAndDayNo(trip.getId(), request.dayNo()).size();
        TripItem item = TripItem.builder()
                .tripId(trip.getId())
                .placeId(place != null ? place.getId() : null)
                .dayNo(request.dayNo())
                .sortOrder(nextOrder)
                .startTime(request.startTime())
                .title(request.title().trim())
                .category(request.category())
                .memo(request.memo())
                .createdBy(userId)
                .build();
        tripItemRepository.save(item);
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
        return TripItemResponse.of(item, place);
    }

    /** 일정 항목 수정 — 커플 둘 다 가능. Day·순서는 reorder 로. */
    @Transactional
    public TripItemResponse updateItem(Long userId, Long tripId, Long itemId, UpdateTripItemRequest request) {
        Trip trip = getCoupleTrip(userId, tripId);
        TripItem item = getTripItem(trip.getId(), itemId);
        item.update(request.title(), request.startTime(), request.category(), request.memo());
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
        Place place = item.getPlaceId() != null
                ? placeRepository.findById(item.getPlaceId()).orElse(null) : null;
        return TripItemResponse.of(item, place);
    }

    /** 일정 항목 삭제. */
    @Transactional
    public void deleteItem(Long userId, Long tripId, Long itemId) {
        Trip trip = getCoupleTrip(userId, tripId);
        TripItem item = getTripItem(trip.getId(), itemId);
        tripItemRepository.delete(item);
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
    }

    /** 일정 순서 일괄 변경 (ITEM-03) — 넘어온 항목만 dayNo·sortOrder 재배치. */
    @Transactional
    public void reorderItems(Long userId, Long tripId, ReorderTripItemsRequest request) {
        Trip trip = getCoupleTrip(userId, tripId);
        Map<Long, TripItem> byId = tripItemRepository
                .findByTripIdOrderByDayNoAscSortOrderAscIdAsc(trip.getId()).stream()
                .collect(Collectors.toMap(TripItem::getId, Function.identity()));
        for (ReorderTripItemsRequest.Entry e : request.items()) {
            TripItem item = byId.get(e.itemId());
            if (item == null) {
                throw new BusinessException(ErrorCode.TRIP_ITEM_NOT_FOUND);
            }
            validateDayNo(trip, e.dayNo());
            item.moveTo(e.dayNo(), e.sortOrder());
        }
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
    }

    /**
     * AI 여행 일정 생성 (ITEM-04) — 여행 제목(지역)·기간·저장 장소·요청사항을 Gemini 에 보내
     * Day 바이 Day 일정을 받아 trip_items 로 저장한다. 기존 일정은 대체된다.
     *
     * <p><b>트랜잭션 밖에서 돈다</b>({@code NOT_SUPPORTED} — 클래스에 걸린 readOnly 트랜잭션도
     * 여기선 적용하지 않는다). 예전엔 이 메서드 전체가 <b>쓰기</b> 트랜잭션이라, 여행·장소를
     * 조회하며 잡은 DB 커넥션을 <b>Gemini 응답을 기다리는 최대 60초 동안 문 채로</b> 있었다.
     * Hikari 기본 풀이 10개라 AI 요청 10건이면 풀이 비고, 그때부터 로그인·채팅처럼 AI 와
     * 무관한 요청까지 커넥션을 못 얻어 죽는다 — 앱에서 "서버가 끊긴다"로 보이던 것의 정체다.
     * 이 경로는 4개 AI 기능 중 유일하게 <b>쓰기</b> 트랜잭션이라 가장 나빴다.
     *
     * <p>대신 순서를 <b>조회 → (트랜잭션 없음) Gemini → 짧은 쓰기</b> 로 나눈다. 원자성이
     * 필요한 DELETE+INSERT 만 {@link TripItineraryWriter} 가 별도 트랜잭션으로 처리한다.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public List<TripDayResponse> generateItinerary(Long userId, Long tripId, String preferences) {
        Trip trip = getCoupleTrip(userId, tripId);
        int totalDays = daysOf(trip);
        List<Place> places = placeRepository.findByCoupleIdOrderByIdDesc(trip.getCoupleId());

        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_TRIP_ITINERARY);
        JsonNode result = geminiClient.generateJson(
                List.of(GeminiClient.textPart(itineraryPrompt(trip, totalDays, places, preferences))),
                ITINERARY_SCHEMA);

        Map<String, Place> placeByName = new HashMap<>();
        for (Place p : places) {
            placeByName.putIfAbsent(p.getName(), p);
        }

        List<TripItem> generated = new ArrayList<>();
        for (JsonNode dayNode : result.path("days")) {
            int dayNo = dayNode.path("dayNo").asInt(0);
            if (dayNo < 1 || dayNo > totalDays) {
                continue; // 기간을 벗어난 Day 는 버린다
            }
            int order = 0;
            for (JsonNode s : dayNode.path("stops")) {
                String title = cap(s.path("title").asText(""), 100);
                if (title == null || title.isBlank()) {
                    continue;
                }
                Place linked = placeByName.get(s.path("placeName").asText(null));
                generated.add(TripItem.builder()
                        .tripId(trip.getId())
                        .placeId(linked != null ? linked.getId() : null)
                        .dayNo(dayNo)
                        .sortOrder(order++)
                        .startTime(parseTime(s.path("startTime").asText(null)))
                        .title(title)
                        .category(cap(s.path("category").asText(null), 30))
                        .memo(s.path("reason").asText(null))
                        .createdBy(userId)
                        .build());
            }
        }
        if (generated.isEmpty()) {
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }

        tripItineraryWriter.replaceItems(trip.getId(), generated);

        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "AI가 여행 일정을 짰어요",
                    userName(userId) + " — " + trip.getTitle(), PushLinks.trip(trip.getId()));
        }
        coupleEventPublisher.publish(trip.getCoupleId(), CoupleEvent.TRIP);
        return buildDays(trip);
    }

    private String itineraryPrompt(Trip trip, int totalDays, List<Place> places, String preferences) {
        String placeBlock = places.isEmpty()
                ? "없음"
                : places.stream()
                        .map(p -> "- " + p.getName()
                                + (p.getCategory() != null ? " [" + p.getCategory() + "]" : "")
                                + (p.getAddress() != null ? " (" + p.getAddress() + ")" : ""))
                        .collect(Collectors.joining("\n"));
        String pref = (preferences != null && !preferences.isBlank())
                ? "\n            - 커플 요청사항: " + preferences.trim() : "";
        return """
                아래 여행에 대한 %d일치 데이 바이 데이 일정을 짜주세요.
                - 여행: %s (%s ~ %s)
                - days: dayNo(1~%d) 별로, 각 day 의 stops 는 2~5곳.
                - 각 stop: startTime("HH:mm" 24시간), title(장소·활동명, 한국어),
                  category(관광/식사/카페/이동/숙소 중 하나), reason(추천 이유 한 문장 한국어).
                - 오전 관광 → 점심 → 오후 → 저녁 식사처럼 시간대와 동선이 자연스럽게 흐르도록.
                - 여행 제목의 지역을 실제 대표 명소·맛집으로 채우되, 아래 [저장된 장소]가 있으면
                  우선 포함하고 그 경우 placeName 에 목록의 이름을 그대로 씁니다.
                  목록에 없는 곳은 placeName 을 비웁니다.%s

                [저장된 장소]
                %s
                """.formatted(totalDays, trip.getTitle(), trip.getStartDate(), trip.getEndDate(),
                totalDays, pref, placeBlock);
    }

    /** "HH:mm" | "H:mm" | "HH:mm:ss" → LocalTime (형식이 어긋나면 null) */
    private LocalTime parseTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String[] parts = raw.trim().split(":");
        if (parts.length < 2) {
            return null;
        }
        try {
            int h = Integer.parseInt(parts[0].trim());
            int m = Integer.parseInt(parts[1].trim());
            if (h < 0 || h > 23 || m < 0 || m > 59) {
                return null;
            }
            return LocalTime.of(h, m);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 컬럼 길이 안전 절단 (공백 정리 후 max 초과 시 자름). */
    private String cap(String s, int max) {
        if (s == null) {
            return null;
        }
        String trimmed = s.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    private int daysOf(Trip trip) {
        return (int) ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
    }

    /** 여행 기간(1~N일차)만큼 Day 를 만들고, 각 Day 에 시간순 항목을 채운다. */
    private List<TripDayResponse> buildDays(Trip trip) {
        List<TripItem> items = tripItemRepository
                .findByTripIdOrderByDayNoAscSortOrderAscIdAsc(trip.getId());
        Map<Long, Place> placeById = items.stream()
                .map(TripItem::getPlaceId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .map(placeRepository::findById)
                .flatMap(java.util.Optional::stream)
                .collect(Collectors.toMap(Place::getId, Function.identity()));

        Map<Integer, List<TripItemResponse>> byDay = items.stream().collect(Collectors.groupingBy(
                TripItem::getDayNo,
                Collectors.mapping(it -> TripItemResponse.of(it, placeById.get(it.getPlaceId())),
                        Collectors.toList())));

        int totalDays = daysOf(trip);
        List<TripDayResponse> days = new ArrayList<>(totalDays);
        for (int day = 1; day <= totalDays; day++) {
            days.add(new TripDayResponse(day, trip.getStartDate().plusDays(day - 1),
                    byDay.getOrDefault(day, List.of())));
        }
        return days;
    }

    private void validateDayNo(Trip trip, int dayNo) {
        int totalDays = daysOf(trip);
        if (dayNo < 1 || dayNo > totalDays) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "일정은 1일차부터 " + totalDays + "일차 사이여야 해요.");
        }
    }

    private TripItem getTripItem(Long tripId, Long itemId) {
        TripItem item = tripItemRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_ITEM_NOT_FOUND));
        if (!item.getTripId().equals(tripId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return item;
    }

    // ---- helpers ----

    private void validateDates(LocalDate start, LocalDate end) {
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일은 시작일 이후여야 해요.");
        }
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private Trip getCoupleTrip(Long userId, Long tripId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_NOT_FOUND));
        if (!trip.getCoupleId().equals(activeCouple(userId).getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return trip;
    }

    private Place getCouplePlace(Long coupleId, Long placeId) {
        Place place = placeRepository.findById(placeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PLACE_NOT_FOUND));
        if (!place.getCoupleId().equals(coupleId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return place;
    }

    private List<PlaceResponse> withSummaries(List<Place> places, Long userId) {
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
        return places.stream()
                .map(p -> {
                    VisitSummary s = summaries.get(p.getId());
                    // 나/상대 분리는 PlaceService 의 것을 그대로 쓴다 — 같은 로직을 두 번
                    // 구현하면 산정 규칙이 바뀔 때 한쪽만 고쳐질 위험이 있다.
                    PlaceService.RatingPair pair = PlaceService.ratingPairOf(
                            ratingsByPlace.getOrDefault(p.getId(), List.of()), userId);
                    // 여행 상세는 매거진 카드가 아니라 목록이라 커버 사진은 필요 없다
                    return s == null
                            ? PlaceResponse.of(p, 0, null, null, pair.mine(), pair.partner(), null, null)
                            : PlaceResponse.of(p, s.getVisitCount(), s.getAvgRating(), s.getLastVisitedAt(),
                                    pair.mine(), pair.partner(), null, null);
                })
                .toList();
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
