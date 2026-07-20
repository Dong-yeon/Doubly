package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.diet.repository.MealRepository;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.PlaceVisitResponse;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.dto.UpdatePlaceRequest;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitSummary;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final MealRepository mealRepository;
    private final NotificationService notificationService;

    public PlaceService(PlaceRepository placeRepository,
                        PlaceVisitRepository placeVisitRepository,
                        RelationRepository relationRepository,
                        UserRepository userRepository,
                        MealRepository mealRepository,
                        NotificationService notificationService) {
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.mealRepository = mealRepository;
        this.notificationService = notificationService;
    }

    /** 장소 등록 (PLACE-01) */
    @Transactional
    public PlaceResponse save(Long userId, SavePlaceRequest request) {
        Relation couple = activeCouple(userId);
        Place place = Place.builder()
                .coupleId(couple.getId())
                .name(request.name().trim())
                .address(request.address())
                .lat(request.lat())
                .lng(request.lng())
                .category(request.category())
                .status(request.status())
                .addedBy(userId)
                .build();
        placeRepository.save(place);
        return PlaceResponse.of(place, 0, null, null);
    }

    /** 커플 공유 장소 목록 — 방문 요약 포함 (PLACE-02) */
    public List<PlaceResponse> list(Long userId) {
        Relation couple = activeCouple(userId);
        List<Place> places = placeRepository.findByCoupleIdOrderByIdDesc(couple.getId());
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

    /** 장소 수정 — 커플 둘 다 가능 (PLACE-03) */
    @Transactional
    public PlaceResponse update(Long userId, Long placeId, UpdatePlaceRequest request) {
        Place place = getCouplePlace(userId, placeId);
        place.update(request.name(), request.address(), request.lat(), request.lng(),
                request.category(), request.status());
        return withSummary(place);
    }

    /** 장소 삭제 — 방문 기록도 함께 삭제(DB ON DELETE CASCADE) */
    @Transactional
    public void delete(Long userId, Long placeId) {
        Place place = getCouplePlace(userId, placeId);
        placeRepository.delete(place);
    }

    /** 방문 기록 추가 — 위시리스트였다면 방문완료로 전환, 상대에게 푸시 (PLACE-04) */
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
        place.markVisited();

        Long partnerId = activeCouple(userId).partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, "새 맛집 방문 기록!",
                    userName(userId) + " — " + place.getName()
                            + (visit.getRating() != null ? " ★" + visit.getRating() : ""));
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
        placeVisitRepository.delete(visit);
    }

    // ---- helpers ----

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

    private PlaceResponse withSummary(Place place) {
        VisitSummary s = placeVisitRepository.summarize(List.of(place.getId()))
                .stream().findFirst().orElse(null);
        return s == null
                ? PlaceResponse.of(place, 0, null, null)
                : PlaceResponse.of(place, s.getVisitCount(), s.getAvgRating(), s.getLastVisitedAt());
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
