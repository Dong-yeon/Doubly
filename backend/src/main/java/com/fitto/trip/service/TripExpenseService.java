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
import com.fitto.trip.domain.TripExpense;
import com.fitto.trip.dto.SaveTripExpenseRequest;
import com.fitto.trip.dto.TripExpenseResponse;
import com.fitto.trip.dto.TripExpensesResponse;
import com.fitto.trip.dto.TripExpensesResponse.Settlement;
import com.fitto.trip.repository.TripExpenseRepository;
import com.fitto.trip.repository.TripRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 커플 여행 경비 정산 — PLAN.md Trip Expenses. 누가 얼마 냈는지 기록하고,
 * 커플 반반 기준으로 "누가 누구에게 얼마" 정산액을 계산한다. (단일 통화 가정)
 */
@Service
@Transactional(readOnly = true)
public class TripExpenseService {

    private static final String DEFAULT_CURRENCY = "KRW";

    private final TripRepository tripRepository;
    private final TripExpenseRepository tripExpenseRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final CoupleEventPublisher coupleEventPublisher;
    private final PlanGuard planGuard;

    public TripExpenseService(TripRepository tripRepository,
                              TripExpenseRepository tripExpenseRepository,
                              RelationRepository relationRepository,
                              UserRepository userRepository,
                              CoupleEventPublisher coupleEventPublisher,
                              PlanGuard planGuard) {
        this.tripRepository = tripRepository;
        this.tripExpenseRepository = tripExpenseRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.coupleEventPublisher = coupleEventPublisher;
        this.planGuard = planGuard;
    }

    /** 경비 추가 — paidBy 미지정 시 호출자. */
    @Transactional
    public TripExpenseResponse add(Long userId, Long tripId, SaveTripExpenseRequest request) {
        planGuard.require(userId, Feature.TRIP_EXPENSE);
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        Long paidBy = resolvePaidBy(couple, userId, request.paidBy());
        validateDayNo(trip, request.dayNo());

        TripExpense expense = TripExpense.builder()
                .tripId(trip.getId())
                .paidBy(paidBy)
                .amount(request.amount())
                .currency(normalizeCurrency(request.currency()))
                .category(request.category())
                .dayNo(request.dayNo())
                .memo(request.memo())
                .createdBy(userId)
                .build();
        tripExpenseRepository.save(expense);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
        return TripExpenseResponse.of(expense, userName(paidBy), paidBy.equals(userId));
    }

    /** 경비 목록 + 조회자 관점 정산 요약. */
    public TripExpensesResponse list(Long userId, Long tripId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        Long partnerId = couple.partnerOf(userId);

        List<TripExpense> expenses = tripExpenseRepository
                .findByTripIdOrderByCreatedAtDescIdDesc(trip.getId());

        Map<Long, String> nameById = new HashMap<>();
        nameById.put(userId, userName(userId));
        if (partnerId != null) {
            nameById.put(partnerId, userName(partnerId));
        }

        BigDecimal myPaid = BigDecimal.ZERO;
        BigDecimal partnerPaid = BigDecimal.ZERO;
        for (TripExpense e : expenses) {
            if (e.getPaidBy().equals(userId)) {
                myPaid = myPaid.add(e.getAmount());
            } else if (partnerId != null && e.getPaidBy().equals(partnerId)) {
                partnerPaid = partnerPaid.add(e.getAmount());
            }
        }
        BigDecimal total = myPaid.add(partnerPaid);

        List<TripExpenseResponse> items = expenses.stream()
                .map(e -> TripExpenseResponse.of(e,
                        nameById.computeIfAbsent(e.getPaidBy(), this::userName),
                        e.getPaidBy().equals(userId)))
                .toList();

        String currency = expenses.isEmpty() ? DEFAULT_CURRENCY : expenses.get(0).getCurrency();
        return new TripExpensesResponse(total, myPaid, partnerPaid, currency,
                partnerId, partnerId != null ? nameById.get(partnerId) : null,
                settlement(myPaid, partnerPaid), items);
    }

    /** 경비 수정 — 커플 둘 다 가능. */
    @Transactional
    public TripExpenseResponse update(Long userId, Long tripId, Long expenseId,
                                      SaveTripExpenseRequest request) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        TripExpense expense = getTripExpense(trip.getId(), expenseId);
        Long paidBy = request.paidBy() != null ? resolvePaidBy(couple, userId, request.paidBy()) : null;
        validateDayNo(trip, request.dayNo());

        expense.update(paidBy, request.amount(), normalizeCurrency(request.currency()),
                request.category(), request.dayNo(), request.memo());
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
        return TripExpenseResponse.of(expense, userName(expense.getPaidBy()),
                expense.getPaidBy().equals(userId));
    }

    /** 경비 삭제 — 커플 둘 다 가능. */
    @Transactional
    public void delete(Long userId, Long tripId, Long expenseId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        TripExpense expense = getTripExpense(trip.getId(), expenseId);
        tripExpenseRepository.delete(expense);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
    }

    // ---- helpers ----

    /** 커플 반반 기준 정산 — 더 낸 쪽이 절반 차액을 받는다. */
    private Settlement settlement(BigDecimal myPaid, BigDecimal partnerPaid) {
        BigDecimal diff = myPaid.subtract(partnerPaid);
        BigDecimal amount = diff.abs().divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
        if (amount.signum() == 0) {
            return new Settlement(Settlement.SETTLED, BigDecimal.ZERO);
        }
        return diff.signum() > 0
                ? new Settlement(Settlement.PARTNER_OWES_ME, amount)  // 내가 더 냄 → 상대가 나에게
                : new Settlement(Settlement.I_OWE_PARTNER, amount);   // 상대가 더 냄 → 내가 상대에게
    }

    private Long resolvePaidBy(Relation couple, Long userId, Long requested) {
        if (requested == null) {
            return userId;
        }
        Long partnerId = couple.partnerOf(userId);
        if (!requested.equals(userId) && !requested.equals(partnerId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "커플 두 사람 중에서만 고를 수 있어요.");
        }
        return requested;
    }

    private String normalizeCurrency(String currency) {
        if (currency == null || currency.isBlank()) {
            return DEFAULT_CURRENCY;
        }
        return currency.trim().toUpperCase();
    }

    private void validateDayNo(Trip trip, Integer dayNo) {
        if (dayNo == null) {
            return;
        }
        int totalDays = (int) ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
        if (dayNo < 1 || dayNo > totalDays) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "며칠차는 1일차부터 " + totalDays + "일차 사이여야 해요.");
        }
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

    private TripExpense getTripExpense(Long tripId, Long expenseId) {
        TripExpense expense = tripExpenseRepository.findById(expenseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_EXPENSE_NOT_FOUND));
        if (!expense.getTripId().equals(tripId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return expense;
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
