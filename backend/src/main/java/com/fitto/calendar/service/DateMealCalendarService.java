package com.fitto.calendar.service;

import com.fitto.calendar.dto.DateMealResponse;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.repository.MealRepository;
import com.fitto.place.domain.Place;
import com.fitto.place.repository.PlaceRepository;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 커플 캘린더의 <b>데이트 기록</b> 오버레이 — 장소가 연결된 데이트 식단을 월 단위로 읽는다.
 *
 * <p><b>왜 일정으로 만들지 않았나.</b> 데이트 식단을 기록할 때마다 {@code couple_events} 에
 * 행을 넣는 방법도 있었지만 세 가지가 걸린다. ① {@code CALENDAR_EVENT} 는 FREE 월 10건이라
 * 자동 생성이 한도를 잠식해 <b>식단 저장에서</b> 402 가 터진다. ② 식단 수정·삭제·"같이 먹기"
 * 해제·일정 삭제까지 네 경로를 양방향으로 맞춰야 한다. ③ 일정은 약속(미래)이고 기록은
 * 지난 일이라 한 표에 섞이면 "다가오는 일정"이 흐려진다. 여행 기간 띠가 이미 같은 이유로
 * 오버레이 방식이다({@code CoupleCalendarScreen}).
 *
 * <p><b>장소가 붙은 것만 싣는다.</b> 자주 만나는 커플은 "같이 먹기"를 매일 찍는다 — 전부
 * 올리면 달력이 마커로 덮여 의미를 잃는다. 장소 연결은 외식과 집밥을 가르는 선이고,
 * 마침 "어디서 먹었는지"가 캘린더에 남길 이유 그 자체다.
 */
@Service
@Transactional(readOnly = true)
public class DateMealCalendarService {

    private final RelationRepository relationRepository;
    private final MealRepository mealRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final PlaceRepository placeRepository;

    public DateMealCalendarService(RelationRepository relationRepository,
                                   MealRepository mealRepository,
                                   PlaceVisitRepository placeVisitRepository,
                                   PlaceRepository placeRepository) {
        this.relationRepository = relationRepository;
        this.mealRepository = mealRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRepository = placeRepository;
    }

    /** 해당 월의 데이트 기록 — 날짜 오름차순. 장소가 연결되지 않은 끼니는 빠진다. */
    public List<DateMealResponse> month(Long userId, int year, int month) {
        Relation couple = requireCouple(userId);
        YearMonth ym = YearMonth.of(year, month);

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        List<Meal> meals = mealRepository.findSharedInPeriod(userIds, ym.atDay(1), ym.atEndOfMonth());
        if (meals.isEmpty()) {
            return List.of();
        }

        Map<Long, VisitWithPlace> visitByMealId = visitsOf(meals);
        Map<Long, Integer> tierByPlaceId = tiersOf(visitByMealId.values());

        List<DateMealResponse> result = new ArrayList<>();
        for (Meal m : meals) {
            VisitWithPlace vp = visitByMealId.get(m.getId());
            if (vp == null) {
                continue; // 집에서 같이 먹은 끼니 — 캘린더에 찍을 "어디"가 없다
            }
            Long placeId = vp.getVisit().getPlaceId();
            result.add(new DateMealResponse(m.getMealDate(), m.getId(), titleOf(m),
                    placeId, vp.getPlaceName(), tierByPlaceId.get(placeId), m.getPhotoUrl()));
        }
        return result;
    }

    /**
     * 끼니 → 연결된 방문. 한 끼니에 방문이 여러 건 붙는 일은 없지만, 있더라도 먼저 온 것을
     * 쓴다 — 캘린더 한 줄에 들어갈 장소는 하나뿐이다({@code FeedService.placeNamesOf} 와 같은 규칙).
     */
    private Map<Long, VisitWithPlace> visitsOf(List<Meal> meals) {
        Map<Long, VisitWithPlace> byMealId = new LinkedHashMap<>();
        for (VisitWithPlace vp : placeVisitRepository.findByMealIdIn(meals.stream().map(Meal::getId).toList())) {
            byMealId.putIfAbsent(vp.getVisit().getMealId(), vp);
        }
        return byMealId;
    }

    /** 럽슐랭 등급 배치 조회 — 장소마다 부르면 N+1 이다. */
    private Map<Long, Integer> tiersOf(java.util.Collection<VisitWithPlace> visits) {
        List<Long> placeIds = visits.stream().map(v -> v.getVisit().getPlaceId()).distinct().toList();
        if (placeIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Integer> byPlaceId = new LinkedHashMap<>();
        for (Place p : placeRepository.findAllById(placeIds)) {
            byPlaceId.put(p.getId(), p.getLovelichelinTier());
        }
        return byPlaceId;
    }

    /** 피드 카드와 같은 규칙 — 음식이 먼저, 없으면 메모, 그마저 없으면 끼니 이름. */
    private String titleOf(Meal m) {
        if (!m.getItems().isEmpty()) {
            return m.getItems().get(0).getName()
                   + (m.getItems().size() > 1 ? " 외 " + (m.getItems().size() - 1) + "개" : "");
        }
        if (m.getMemo() != null && !m.getMemo().isBlank()) {
            return m.getMemo();
        }
        return m.getMealType().label() + " 식단";
    }

    private Relation requireCouple(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            throw new BusinessException(ErrorCode.RELATION_NOT_FOUND);
        }
        return couples.get(0);
    }
}
