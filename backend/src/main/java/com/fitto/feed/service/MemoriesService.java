package com.fitto.feed.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.content.repository.ContentLogRepository;
import com.fitto.content.repository.ContentLogRepository.LogWithContent;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.calendar.domain.CalendarEvent;
import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.repository.CalendarEventRepository;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.repository.MealRepository;
import com.fitto.feed.dto.MemoriesResponse;
import com.fitto.feed.dto.MemoryAnniversaryResponse;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import com.fitto.feed.dto.MemoryGroupResponse;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitWithPlace;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 추억 리마인드 — "작년 오늘" (PLAN.md Memories).
 *
 * <p>오늘과 같은 월·일의 <b>1년 이상 전</b> 기록을 연도별로 묶어 돌려준다.
 * 신규 테이블 없이 기존 {@code feed_posts} · {@code place_visits} · {@code content_logs} 를 다시 읽는다.
 *
 * <p><b>대상</b>: POST · PLACE_VISIT · CONTENT_LOG, 그리고 2026-10-02 부터 <b>사진이 있는</b> 식단·운동.
 * 예전엔 운동·식단을 통째로 뺐다 — 거의 매일 있어 추억을 노이즈로 덮고, 커플이 아니라 사용자
 * 스코프라 "우리 추억"의 경계가 흐려진다는 이유였다. 그 걱정은 여전히 맞아서 <b>사진 있는 것만</b>
 * 싣는다(사진첩 "우리" 탭과 같은 규칙 — 데이트 식단 복제본 제외, 운동은 공유한 사진만). 사진을 남긴
 * 끼니·오운완은 그날을 기억하려고 남긴 것이라 회상 가치가 있다. 날짜는 등록일이 아니라 먹은 날·
 * 운동한 날이다(방문과 같은 원칙).
 *
 * <p><b>아침 푸시({@link MemoriesNotifier})는 그대로 POST·방문·관람만 센다.</b> 사진 끼니까지 세면
 * 두 해째부터 거의 매일 푸시가 간다 — 들어와서 보는 것과 불러내는 것은 기준이 달라도 된다.
 *
 * <p><b>기념일</b>({@link MemoryAnniversaryResponse}): 사귄 지 N주년·100일 단위(사귄 날이 1일 —
 * 앱 D-day 와 같은 셈), 캘린더의 매년 반복 일정, 몇 년 전 오늘의 단발 일정. 캘린더는
 * {@code visibleTo} 를 지난다(상대의 '나만 보기' 일정이 새면 안 된다).
 */
@Service
@Transactional(readOnly = true)
public class MemoriesService {

    private static final Logger log = LoggerFactory.getLogger(MemoriesService.class);

    /** 한 번에 내려주는 아이템 상한 — 넘으면 최신 연도부터 채우고 자른다. */
    private static final int MAX_ITEMS = 30;

    private final FeedPostRepository feedPostRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final ContentLogRepository contentLogRepository;
    private final RelationRepository relationRepository;
    private final FeedItemMapper mapper;
    private final PlanGuard planGuard;
    private final MealRepository mealRepository;
    private final WorkoutRepository workoutRepository;
    private final CalendarEventRepository calendarEventRepository;

    /**
     * {@code created_at} 이 어느 TZ 벽시계로 적혔는지 — {@link MemoryDates#storageStartOfDay} 참고.
     * 기본값은 JVM 기본 TZ 이고, 컨테이너 TZ 가 바뀌면 {@code FITTO_STORAGE_ZONE} 으로 고정할 수 있다.
     */
    private final ZoneId storageZone;

    public MemoriesService(FeedPostRepository feedPostRepository,
                           PlaceVisitRepository placeVisitRepository,
                           ContentLogRepository contentLogRepository,
                           RelationRepository relationRepository,
                           FeedItemMapper mapper,
                           PlanGuard planGuard,
                           MealRepository mealRepository,
                           WorkoutRepository workoutRepository,
                           CalendarEventRepository calendarEventRepository,
                           @Value("${fitto.storage-zone:}") String storageZone) {
        this.feedPostRepository = feedPostRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.contentLogRepository = contentLogRepository;
        this.relationRepository = relationRepository;
        this.mapper = mapper;
        this.planGuard = planGuard;
        this.mealRepository = mealRepository;
        this.workoutRepository = workoutRepository;
        this.calendarEventRepository = calendarEventRepository;
        this.storageZone = MemoryDates.storageZoneOf(storageZone);
    }

    /**
     * 그 날의 추억.
     *
     * @param on 기준 날짜(KST). null 이면 오늘
     */
    public MemoriesResponse memories(Long userId, LocalDate on) {
        Relation couple = activeCouple(userId);
        LocalDate today = on != null ? on : MemoryDates.todayInKst();

        // 잠겨 있어도 200 을 준다 — 홈이 매일 부르는 조회라 402 를 던지면
        // 앱을 열 때마다 업그레이드 시트가 뜬다.
        if (!planGuard.allows(userId, Feature.MEMORIES)) {
            return MemoriesResponse.locked(today);
        }

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        List<MemoryAnniversaryResponse> anniversaries = anniversariesOn(couple, today, userId);

        Integer earliestYear = earliestRecordYear(couple.getId(), userIds);
        if (earliestYear == null || earliestYear >= today.getYear()) {
            // 기록이 없거나 전부 올해 것 — 추억이 될 만큼 오래된 게 없다(기념일은 따로 있을 수 있다)
            return new MemoriesResponse(today, 0, List.of(), false, anniversaries);
        }

        Map<Long, String> names = mapper.userNames(userIds);

        List<MemoryGroupResponse> groups = new ArrayList<>();
        int total = 0;
        boolean cut = false;

        int year = today.getYear() - 1;
        for (; year >= earliestYear && total < MAX_ITEMS; year--) {
            List<FeedItemResponse> items = itemsOn(couple.getId(), userIds, year, today, names, userId);
            if (items.isEmpty()) {
                continue;
            }
            if (total + items.size() > MAX_ITEMS) {
                items = items.subList(0, MAX_ITEMS - total);
                cut = true;
            }
            int yearsAgo = today.getYear() - year;
            groups.add(new MemoryGroupResponse(yearsAgo, MemoryDates.occurrenceIn(year, today),
                    yearsAgo + "년 전 오늘", items));
            total += items.size();
        }

        // 조용히 자르면 "다 보여줬다"로 읽힌다 — 무엇을 덜 보냈는지 남긴다
        if (cut || year >= earliestYear) {
            log.info("추억 리마인드 상한 — coupleId={} on={} 상한 {}건, {}년 이전은 조회하지 않음",
                    couple.getId(), today, MAX_ITEMS, year + 1);
        }
        return new MemoriesResponse(today, total, groups, false, anniversaries);
    }

    /** 한 연도의 아이템 — 윤년 보정이 걸리면 두 날짜를 함께 읽어 한 그룹으로 묶는다. */
    private List<FeedItemResponse> itemsOn(Long coupleId, List<Long> userIds, int year, LocalDate today,
                                           Map<Long, String> names, Long viewerId) {
        List<FeedItemResponse> items = new ArrayList<>();
        for (LocalDate date : MemoryDates.occurrencesIn(year, today)) {
            LocalDateTime from = MemoryDates.storageStartOfDay(date, storageZone);
            LocalDateTime to = MemoryDates.storageStartOfDay(date.plusDays(1), storageZone);
            List<FeedPost> posts = feedPostRepository.findInPeriod(coupleId, from, to);
            Map<Long, List<String>> photosByPost = mapper.photosByPostId(posts);
            for (FeedPost p : posts) {
                items.add(mapper.toItem(p, names, viewerId, null, photosByPost.getOrDefault(p.getId(), List.of())));
            }
            for (VisitWithPlace v : placeVisitRepository.findByCoupleAndVisitedAt(coupleId, date)) {
                // 방문은 등록 시각이 아니라 방문일 기준 — 어제 다녀와 오늘 등록해도 어제의 추억이다
                items.add(mapper.toItem(v, names, viewerId, true));
            }
            for (LogWithContent l : contentLogRepository.findByCoupleAndWatchedAt(coupleId, date)) {
                // 관람도 등록 시각이 아니라 관람일 기준 — 방문 기록과 같은 이유
                items.add(mapper.toItem(l, names, viewerId, true));
            }
            // 사진 있는 끼니·오운완 — 사진첩과 같은 쿼리(같은 공개·중복 제거 규칙). 하루치라 상한은 넉넉히
            Pageable day = PageRequest.of(0, MAX_ITEMS);
            List<Meal> meals = mealRepository.findPhotosInDateRange(userIds, date, date, day);
            for (Meal m : meals) {
                items.add(onDay(mapper.toItem(m, names, viewerId, null), date));
            }
            for (Workout w : workoutRepository.findPhotosInDateRange(userIds, date, date, day)) {
                items.add(onDay(mapper.toItem(w, names, viewerId), date));
            }
        }
        items.sort(Comparator.comparing(FeedItemResponse::occurredAt)
                .thenComparing(FeedItemResponse::refId)
                .reversed());
        return mapper.attachReactions(items, viewerId);
    }

    /**
     * 식단·운동 아이템의 시각을 기록일 자정으로 — 방문·관람의 {@code byVisitedAt} 과 같은 처리.
     * 그대로 두면 등록 시각이 실려, 지난 날짜로 늦게 올린 끼니가 다른 날 시각으로 보인다.
     */
    private static FeedItemResponse onDay(FeedItemResponse i, LocalDate date) {
        return new FeedItemResponse(i.type(), i.refId(), i.userId(), i.userName(), i.mine(), i.title(),
                i.content(), i.imageUrl(), date.atStartOfDay(), i.reactions(), i.imageUrls(), i.shared(),
                i.summary());
    }

    /**
     * 오늘의 기념일. 순서: 사귄 날 기준(주년 → 100일 단위) → 캘린더 반복 → 몇 년 전 오늘의 일정.
     */
    private List<MemoryAnniversaryResponse> anniversariesOn(Relation couple, LocalDate today, Long viewerId) {
        List<MemoryAnniversaryResponse> out = new ArrayList<>();
        LocalDate start = couple.getAnniversaryDate();
        if (start != null && start.isBefore(today)) {
            int years = today.getYear() - start.getYear();
            if (years >= 1 && MemoryDates.occurrenceIn(today.getYear(), start).equals(today)) {
                out.add(new MemoryAnniversaryResponse(MemoryAnniversaryResponse.Kind.COUPLE_YEARS,
                        "오늘은 우리 " + years + "주년", years, null, null));
            }
            // 사귄 날이 1일 — 앱 D-day(utils/anniversary.ts daysSinceKst)와 같은 셈
            long days = ChronoUnit.DAYS.between(start, today) + 1;
            if (days % 100 == 0) {
                out.add(new MemoryAnniversaryResponse(MemoryAnniversaryResponse.Kind.COUPLE_DAYS,
                        "오늘은 우리 " + days + "일", null, (int) days, null));
            }
        }
        for (CalendarEvent e : calendarEventRepository.findByCoupleId(couple.getId())) {
            LocalDate origin = e.getEventDate();
            int years = today.getYear() - origin.getYear();
            if (years < 1 || !e.visibleTo(viewerId)
                    || !MemoryDates.occurrenceIn(today.getYear(), origin).equals(today)) {
                continue;
            }
            if (e.isRepeatYearly()) {
                // 생일은 나이를 세지 않는다 — "엄마 생일 52주년" 같은 문구가 된다
                String label = e.getEventType() == EventType.ANNIVERSARY
                        ? e.getTitle() + " " + years + "주년"
                        : e.getTitle();
                out.add(new MemoryAnniversaryResponse(MemoryAnniversaryResponse.Kind.EVENT_YEARLY,
                        label, years, null, e.getId()));
            } else {
                out.add(new MemoryAnniversaryResponse(MemoryAnniversaryResponse.Kind.EVENT_PAST,
                        years + "년 전 오늘 · " + e.getTitle(), years, null, e.getId()));
            }
        }
        return out;
    }

    /**
     * 훑어볼 연도의 하한 — 커플의 첫 기록 연도. 기록이 하나도 없으면 null.
     *
     * <p>포스트 쪽 값은 저장 TZ 의 벽시계라 연말·연초에 한 해 어긋날 수 있지만,
     * <b>하한으로만 쓰므로</b> 최악의 경우 빈 범위 조회가 한 번 더 도는 것이 전부다.
     */
    private Integer earliestRecordYear(Long coupleId, List<Long> userIds) {
        LocalDateTime firstPost = feedPostRepository.findEarliestCreatedAt(coupleId);
        Integer earliest = firstPost != null ? firstPost.getYear() : null;
        for (LocalDate d : new LocalDate[]{
                placeVisitRepository.findEarliestVisitedAt(coupleId),
                contentLogRepository.findEarliestWatchedAt(coupleId),
                mealRepository.findEarliestPhotoMealDate(userIds),
                workoutRepository.findEarliestPhotoWorkoutDate(userIds)}) {
            if (d != null) {
                earliest = (earliest == null) ? d.getYear() : Math.min(earliest, d.getYear());
            }
        }
        return earliest;
    }

    /*
     * README "착수 시 주의사항 3" 이 지적한 activeCouple 복제 패턴을 그대로 따른다.
     * 관계 스코프 통일은 패밀리(N인) 확장의 선행 작업이라 여기서 건드리지 않는다.
     */
    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }
}
