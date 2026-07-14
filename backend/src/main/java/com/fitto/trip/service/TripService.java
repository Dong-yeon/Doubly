package com.fitto.trip.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.place.domain.Place;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitSummary;
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
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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

    private final TripRepository tripRepository;
    private final TripItemRepository tripItemRepository;
    private final PlaceRepository placeRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public TripService(TripRepository tripRepository,
                       TripItemRepository tripItemRepository,
                       PlaceRepository placeRepository,
                       PlaceVisitRepository placeVisitRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher) {
        this.tripRepository = tripRepository;
        this.tripItemRepository = tripItemRepository;
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** 여행 생성 (TRIP-01) — 상대에게 푸시 + TRIP 이벤트. */
    @Transactional
    public TripResponse save(Long userId, SaveTripRequest request) {
        validateDates(request.startDate(), request.endDate());
        Relation couple = activeCouple(userId);
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
            notificationService.notify(partnerId, "새 여행 계획 ✈️",
                    userName(userId) + " — " + trip.getTitle()
                            + " (" + trip.getStartDate().format(DATE_FMT) + "~)");
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
        return new TripDetailResponse(TripResponse.of(trip, places.size()), days, withSummaries(places));
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

        int totalDays = (int) ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
        List<TripDayResponse> days = new ArrayList<>(totalDays);
        for (int day = 1; day <= totalDays; day++) {
            days.add(new TripDayResponse(day, trip.getStartDate().plusDays(day - 1),
                    byDay.getOrDefault(day, List.of())));
        }
        return days;
    }

    private void validateDayNo(Trip trip, int dayNo) {
        int totalDays = (int) ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
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

    private List<PlaceResponse> withSummaries(List<Place> places) {
        if (places.isEmpty()) {
            return List.of();
        }
        Map<Long, VisitSummary> summaries = placeVisitRepository
                .summarize(places.stream().map(Place::getId).toList())
                .stream()
                .collect(Collectors.toMap(VisitSummary::getPlaceId, Function.identity()));
        return places.stream()
                .map(p -> {
                    VisitSummary s = summaries.get(p.getId());
                    return s == null
                            ? PlaceResponse.of(p, 0, null, null)
                            : PlaceResponse.of(p, s.getVisitCount(), s.getAvgRating(), s.getLastVisitedAt());
                })
                .toList();
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
