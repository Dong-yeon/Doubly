package com.fitto.trip.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.time.KstClock;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.place.domain.PlaceStatus;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trip.domain.Trip;
import com.fitto.trip.domain.TripChecklistItem;
import com.fitto.trip.domain.TripExpense;
import com.fitto.trip.dto.TripRecapResponse;
import com.fitto.trip.repository.TripChecklistItemRepository;
import com.fitto.trip.repository.TripExpenseRepository;
import com.fitto.trip.repository.TripItemRepository;
import com.fitto.trip.repository.TripRepository;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 여행 회고 카드 — PLAN.md Trip Recap. 여행 하나에 쌓인 일정·장소·경비·사진·준비물을
 * 집계해 한 장의 요약으로 돌려준다. (AI 없이 순수 집계 — 항상 빠르게 동작)
 */
@Service
@Transactional(readOnly = true)
public class TripRecapService {

    private final TripRepository tripRepository;
    private final TripItemRepository tripItemRepository;
    private final TripExpenseRepository tripExpenseRepository;
    private final TripChecklistItemRepository checklistRepository;
    private final PlaceRepository placeRepository;
    private final FeedPostRepository feedPostRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;

    public TripRecapService(TripRepository tripRepository,
                            TripItemRepository tripItemRepository,
                            TripExpenseRepository tripExpenseRepository,
                            TripChecklistItemRepository checklistRepository,
                            PlaceRepository placeRepository,
                            FeedPostRepository feedPostRepository,
                            RelationRepository relationRepository,
                            WorkoutRepository workoutRepository) {
        this.tripRepository = tripRepository;
        this.tripItemRepository = tripItemRepository;
        this.tripExpenseRepository = tripExpenseRepository;
        this.checklistRepository = checklistRepository;
        this.placeRepository = placeRepository;
        this.feedPostRepository = feedPostRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
    }

    public TripRecapResponse recap(Long userId, Long tripId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        Long id = trip.getId();

        int days = (int) ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
        int nights = Math.max(days - 1, 0);
        String status = status(trip);

        List<TripExpense> expenses = tripExpenseRepository.findByTripIdOrderByCreatedAtDescIdDesc(id);
        BigDecimal expenseTotal = expenses.stream()
                .map(TripExpense::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        String currency = expenses.isEmpty() ? "KRW" : expenses.get(0).getCurrency();

        List<TripChecklistItem> checklist = checklistRepository.findByTripIdOrderBySortOrderAscIdAsc(id);
        int checklistTotal = checklist.size();
        int checklistChecked = (int) checklist.stream().filter(TripChecklistItem::isChecked).count();

        List<Long> memberIds = List.of(couple.getUserAId(), couple.getUserBId()).stream()
                .filter(java.util.Objects::nonNull).toList();
        long workoutCount = memberIds.isEmpty() ? 0
                : workoutRepository.countByUserIdInAndWorkoutDateBetween(
                        memberIds, trip.getStartDate(), trip.getEndDate());

        return new TripRecapResponse(
                id, trip.getTitle(), trip.getStartDate(), trip.getEndDate(),
                nights, days, status,
                tripItemRepository.countByTripId(id),
                placeRepository.countByTripId(id),
                placeRepository.countByTripIdAndStatus(id, PlaceStatus.VISITED),
                expenseTotal, currency,
                feedPostRepository.countByTripId(id),
                checklistTotal, checklistChecked,
                workoutCount, trip.isTravelModeEnabled());
    }

    private String status(Trip trip) {
        LocalDate today = KstClock.today();
        if (today.isBefore(trip.getStartDate())) {
            return TripRecapResponse.UPCOMING;
        }
        if (!today.isAfter(trip.getEndDate())) {
            return TripRecapResponse.ONGOING;
        }
        return TripRecapResponse.PAST;
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
}
