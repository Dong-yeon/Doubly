package com.fitto.trip.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trip.domain.Trip;
import com.fitto.trip.domain.TripChecklistItem;
import com.fitto.trip.dto.ChecklistItemResponse;
import com.fitto.trip.dto.ChecklistResponse;
import com.fitto.trip.dto.SaveChecklistItemRequest;
import com.fitto.trip.repository.TripChecklistItemRepository;
import com.fitto.trip.repository.TripRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 커플 여행 준비물 체크리스트 — PLAN.md Trip Checklist. 커플 둘 다 추가/체크/수정/삭제 가능,
 * 변경 시 커플 채널 TRIP 이벤트로 실시간 갱신한다.
 */
@Service
@Transactional(readOnly = true)
public class TripChecklistService {

    private final TripRepository tripRepository;
    private final TripChecklistItemRepository checklistRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final CoupleEventPublisher coupleEventPublisher;
    private final PlanGuard planGuard;

    public TripChecklistService(TripRepository tripRepository,
                                TripChecklistItemRepository checklistRepository,
                                RelationRepository relationRepository,
                                UserRepository userRepository,
                                CoupleEventPublisher coupleEventPublisher,
                                PlanGuard planGuard) {
        this.tripRepository = tripRepository;
        this.checklistRepository = checklistRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.coupleEventPublisher = coupleEventPublisher;
        this.planGuard = planGuard;
    }

    /** 체크리스트 목록 + 진행 개수. */
    public ChecklistResponse list(Long userId, Long tripId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        return build(trip.getId());
    }

    /** 준비물 추가 — 맨 뒤에 붙인다. */
    @Transactional
    public ChecklistItemResponse add(Long userId, Long tripId, SaveChecklistItemRequest request) {
        planGuard.require(userId, Feature.TRIP_CHECKLIST);
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);

        int nextOrder = (int) checklistRepository.countByTripId(trip.getId());
        TripChecklistItem item = TripChecklistItem.builder()
                .tripId(trip.getId())
                .content(request.content().trim())
                .sortOrder(nextOrder)
                .createdBy(userId)
                .build();
        checklistRepository.save(item);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
        return ChecklistItemResponse.of(item, null);
    }

    /** 이름 수정. */
    @Transactional
    public ChecklistItemResponse rename(Long userId, Long tripId, Long itemId,
                                        SaveChecklistItemRequest request) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        TripChecklistItem item = getItem(trip.getId(), itemId);
        item.rename(request.content().trim());
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
        return ChecklistItemResponse.of(item, checkedByName(item));
    }

    /** 체크 토글. */
    @Transactional
    public ChecklistItemResponse toggle(Long userId, Long tripId, Long itemId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        TripChecklistItem item = getItem(trip.getId(), itemId);
        item.toggle(userId);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
        return ChecklistItemResponse.of(item, checkedByName(item));
    }

    /** 삭제. */
    @Transactional
    public void delete(Long userId, Long tripId, Long itemId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        TripChecklistItem item = getItem(trip.getId(), itemId);
        checklistRepository.delete(item);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
    }

    // ---- helpers ----

    private ChecklistResponse build(Long tripId) {
        List<TripChecklistItem> items = checklistRepository.findByTripIdOrderBySortOrderAscIdAsc(tripId);
        Map<Long, String> nameCache = new HashMap<>();
        List<ChecklistItemResponse> responses = items.stream()
                .map(it -> ChecklistItemResponse.of(it,
                        it.getCheckedBy() == null ? null
                                : nameCache.computeIfAbsent(it.getCheckedBy(), this::userName)))
                .toList();
        int checked = (int) items.stream().filter(TripChecklistItem::isChecked).count();
        return new ChecklistResponse(items.size(), checked, responses);
    }

    private String checkedByName(TripChecklistItem item) {
        return item.getCheckedBy() == null ? null : userName(item.getCheckedBy());
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private Trip getCoupleTrip(Relation couple, Long tripId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_NOT_FOUND));
        if (!trip.getCoupleId().equals(couple.getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return trip;
    }

    private TripChecklistItem getItem(Long tripId, Long itemId) {
        TripChecklistItem item = checklistRepository.findById(itemId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_CHECKLIST_ITEM_NOT_FOUND));
        if (!item.getTripId().equals(tripId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return item;
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
