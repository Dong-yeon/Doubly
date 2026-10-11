package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.repository.MealRepository;
import com.fitto.place.dto.EatOutStatsResponse;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitWithPlace;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 이번 달 외식 통계(LOVEBODY_LOVELICHELIN_LINK P2-3) — 커플 장소의 방문을 한 달 범위로 묶어 센다.
 *
 * <p>"외식" = <b>식단이 붙은 방문</b>. 장소가 없는 식단(집밥·배달)은 외식이 아니고, 식단 없는 방문(카페·전시)은 "다녀온 곳"에만
 * 든다. 같이 먹기는 방문이 작성자 몫에만 붙으므로(결정 Q7) 한 번으로 센다.
 *
 * <p>쿼리는 기존 캘린더용 기간 조회({@code findByCoupleInPeriod})와 끼니 배치 조회 두 번 + 첫 방문일 집계 한 번이다.
 * 한 커플의 한 달 방문은 많아야 수십 건이라 앱에서 센다 (추정 — 운영 데이터로 재 본 적은 없다).
 */
@Service
@Transactional(readOnly = true)
public class EatOutStatsService {

    private final PlaceVisitRepository placeVisitRepository;
    private final MealRepository mealRepository;
    private final RelationRepository relationRepository;

    public EatOutStatsService(PlaceVisitRepository placeVisitRepository, MealRepository mealRepository,
                              RelationRepository relationRepository) {
        this.placeVisitRepository = placeVisitRepository;
        this.mealRepository = mealRepository;
        this.relationRepository = relationRepository;
    }

    /** @param month "YYYY-MM", null 이면 KST 이번 달 */
    public EatOutStatsResponse stats(Long userId, String month) {
        Relation couple = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND, "커플 연결 후 사용할 수 있는 기능이에요."));
        YearMonth ym = parse(month);
        List<VisitWithPlace> visits = placeVisitRepository.findByCoupleInPeriod(couple.getId(),
                ym.atDay(1), ym.atEndOfMonth());
        List<VisitWithPlace> previous = placeVisitRepository.findByCoupleInPeriod(couple.getId(),
                ym.minusMonths(1).atDay(1), ym.minusMonths(1).atEndOfMonth());

        List<Long> mealIds = visits.stream().map(v -> v.getVisit().getMealId()).filter(Objects::nonNull).toList();
        Map<Long, Meal> meals = mealRepository.findAllById(mealIds).stream()
                .collect(Collectors.toMap(Meal::getId, Function.identity()));
        List<Meal> outingMeals = mealIds.stream().map(meals::get).filter(Objects::nonNull).toList();

        // 끼니 순서는 하루의 순서로 고정한다(아침→점심→저녁→간식) — 0 인 끼니는 뺀다
        Map<String, Integer> byMealType = new LinkedHashMap<>();
        for (com.fitto.diet.domain.MealType t : com.fitto.diet.domain.MealType.values()) {
            int n = (int) outingMeals.stream().filter(m -> m.getMealType() == t).count();
            if (n > 0) byMealType.put(t.name(), n);
        }

        Map<Long, String> names = new LinkedHashMap<>();
        Map<Long, Integer> counts = new LinkedHashMap<>();
        for (VisitWithPlace v : visits) {
            names.putIfAbsent(v.getVisit().getPlaceId(), v.getPlaceName());
            counts.merge(v.getVisit().getPlaceId(), 1, Integer::sum);
        }
        List<EatOutStatsResponse.TopPlace> top = counts.entrySet().stream()
                .sorted(Map.Entry.<Long, Integer>comparingByValue(Comparator.reverseOrder()))
                .limit(3)
                .map(e -> new EatOutStatsResponse.TopPlace(e.getKey(), names.get(e.getKey()), e.getValue()))
                .toList();

        // 이번 달에 처음 가 본 곳 — 그 장소의 첫 방문일이 이 달 안
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        int newPlaces = counts.isEmpty() ? 0 : (int) placeVisitRepository.firstVisitDates(counts.keySet()).stream()
                .filter(f -> !f.getFirstDate().isBefore(start) && !f.getFirstDate().isAfter(end))
                .count();

        int previousOutings = (int) previous.stream().filter(v -> v.getVisit().getMealId() != null).count();
        return new EatOutStatsResponse(ym.toString(), outingMeals.size(),
                (int) outingMeals.stream().filter(Meal::isSharedMeal).count(),
                visits.size(), newPlaces, top, byMealType, previousOutings);
    }

    private static YearMonth parse(String month) {
        if (month == null || month.isBlank()) return YearMonth.from(KstClock.today());
        try {
            return YearMonth.parse(month.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "달은 YYYY-MM 형식이에요.");
        }
    }
}
