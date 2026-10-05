package com.fitto.calendar.service;

import com.fitto.calendar.dto.DateMealResponse;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.repository.MealRepository;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceVisit;
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
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 커플 캘린더의 <b>다녀온 곳</b> 오버레이 — 장소가 연결된 데이트 식단과 커플 장소 방문을 월 단위로 읽는다.
 *
 * <p><b>왜 일정으로 만들지 않았나.</b> 데이트 식단을 기록할 때마다 {@code couple_events} 에
 * 행을 넣는 방법도 있었지만 세 가지가 걸린다. ① {@code CALENDAR_EVENT} 는 FREE 한도(지금은 다가오는 일정 10개, 2026-10-05 전엔 월 10건)라
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

    /**
     * 해당 월의 다녀온 곳 — 날짜 오름차순, <b>같은 날·같은 장소는 한 줄</b>.
     *
     * <p>두 갈래를 합친다.
     * <ol>
     *   <li><b>같이 먹기 식단 + 장소</b>(원래 경로) — 둘이 함께 간 것이 확실하다(visitedBy=null).</li>
     *   <li><b>그 밖의 방문</b> — "다녀왔어요"는 식단을 같이 먹기로 저장하지 않아 1번에 걸리지
     *       않았다(2026-10-02 확인). 방문은 한 사람이 기록하므로 그 사람을 visitedBy 로 싣고,
     *       같은 날 같은 장소를 상대도 기록했으면 함께 간 것으로 본다.</li>
     * </ol>
     * 혼자 다녀온 곳도 싣는다 — 데이트인지는 화면이 "누가 갔는지"로 보여주고 사용자가 읽는다
     * (예전엔 "혼자 먹은 기록은 데이트가 아니다"로 뺐지만, 그 탓에 "다녀왔어요"가 통째로 빠졌다).
     */
    public List<DateMealResponse> month(Long userId, int year, int month) {
        Relation couple = requireCouple(userId);
        YearMonth ym = YearMonth.of(year, month);
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        List<Meal> sharedMeals = mealRepository.findSharedInPeriod(userIds, start, end);
        List<VisitWithPlace> visits = placeVisitRepository.findByCoupleInPeriod(couple.getId(), start, end);

        // (날짜, 장소) → 한 줄. 삽입 순서를 지켜 같은 날 안의 순서가 흔들리지 않게 한다
        Map<String, DateMealResponse> byDayPlace = new LinkedHashMap<>();
        Set<Long> consumedVisitIds = new HashSet<>();

        // ① 같이 먹기 식단 — 둘이 함께 간 것이 확실하다
        Map<Long, VisitWithPlace> visitByMealId = sharedMeals.isEmpty() ? Map.of() : visitsOf(sharedMeals);
        for (Meal m : sharedMeals) {
            VisitWithPlace vp = visitByMealId.get(m.getId());
            if (vp == null) {
                continue; // 집에서 같이 먹은 끼니 — 캘린더에 찍을 "어디"가 없다
            }
            consumedVisitIds.add(vp.getVisit().getId());
            Long placeId = vp.getVisit().getPlaceId();
            byDayPlace.putIfAbsent(key(m.getMealDate(), placeId), new DateMealResponse(
                    m.getMealDate(), m.getId(), titleOf(m), placeId, vp.getPlaceName(), null,
                    m.getPhotoUrl(), vp.getVisit().getId(), null));
        }

        // ② 그 밖의 방문 — 식단이 붙어 있으면 그 음식을 제목으로 쓴다
        Map<Long, Meal> linkedMeals = linkedMealsOf(visits, consumedVisitIds);
        for (VisitWithPlace vp : visits) {
            PlaceVisit v = vp.getVisit();
            if (!consumedVisitIds.add(v.getId())) {
                continue;
            }
            String k = key(v.getVisitedAt(), v.getPlaceId());
            DateMealResponse existing = byDayPlace.get(k);
            if (existing != null) {
                // 같은 날 같은 곳을 상대도 기록했다 — 함께 간 것이다
                if (existing.visitedBy() != null && !existing.visitedBy().equals(v.getVisitedBy())) {
                    byDayPlace.put(k, withVisitedBy(existing, null));
                }
                continue;
            }
            Meal meal = v.getMealId() != null ? linkedMeals.get(v.getMealId()) : null;
            byDayPlace.put(k, new DateMealResponse(v.getVisitedAt(), v.getMealId(), titleOf(v, meal),
                    v.getPlaceId(), vp.getPlaceName(), null,
                    v.getImageUrl() != null ? v.getImageUrl() : (meal != null ? meal.getPhotoUrl() : null),
                    v.getId(), v.getVisitedBy()));
        }

        Map<Long, Integer> tierByPlaceId = tiersOf(byDayPlace.values());
        return byDayPlace.values().stream()
                .map(r -> withTier(r, tierByPlaceId.get(r.placeId())))
                .sorted(Comparator.comparing(DateMealResponse::date))
                .toList();
    }

    private static String key(LocalDate date, Long placeId) {
        return date + "#" + placeId;
    }

    /** 방문에 붙은 식단(같이 먹기가 아닌 것) — 제목·사진을 빌려 온다. 한 번에 읽는다. */
    private Map<Long, Meal> linkedMealsOf(List<VisitWithPlace> visits, Set<Long> consumedVisitIds) {
        List<Long> mealIds = visits.stream()
                .map(VisitWithPlace::getVisit)
                .filter(v -> v.getMealId() != null && !consumedVisitIds.contains(v.getId()))
                .map(PlaceVisit::getMealId)
                .distinct()
                .toList();
        if (mealIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Meal> byId = new HashMap<>();
        for (Meal m : mealRepository.findAllById(mealIds)) {
            byId.put(m.getId(), m);
        }
        return byId;
    }

    /**
     * 식단 경로가 아닌 방문의 제목 — 음식 항목이 있으면 음식, 없으면 방문 메모, 그마저 없으면
     * "다녀왔어요". 식단 메모는 쓰지 않는다: "다녀왔어요"가 만든 식단은 메모가 "장소명 · 메모"라
     * 바로 위에 찍히는 장소명과 겹친다.
     */
    private String titleOf(PlaceVisit v, Meal meal) {
        if (meal != null && !meal.getItems().isEmpty()) {
            return titleOf(meal);
        }
        if (v.getMemo() != null && !v.getMemo().isBlank()) {
            return v.getMemo();
        }
        return "다녀왔어요";
    }

    private static DateMealResponse withVisitedBy(DateMealResponse r, Long visitedBy) {
        return new DateMealResponse(r.date(), r.mealId(), r.title(), r.placeId(), r.placeName(),
                r.lovelichelinTier(), r.photoUrl(), r.visitId(), visitedBy);
    }

    private static DateMealResponse withTier(DateMealResponse r, Integer tier) {
        return new DateMealResponse(r.date(), r.mealId(), r.title(), r.placeId(), r.placeName(),
                tier, r.photoUrl(), r.visitId(), r.visitedBy());
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
    private Map<Long, Integer> tiersOf(Collection<DateMealResponse> rows) {
        List<Long> placeIds = rows.stream().map(DateMealResponse::placeId).distinct().toList();
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
