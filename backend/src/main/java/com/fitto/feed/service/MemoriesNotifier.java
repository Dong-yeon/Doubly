package com.fitto.feed.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanResolver;
import com.fitto.common.plan.Plan;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 추억 리마인드 아침 푸시 — PLAN.md Memories. {@code CalendarDdayNotifier} 를 본떴다.
 *
 * <p><b>09:00 이 아니라 10:00 인 이유</b>: 캘린더 D-day 푸시가 09:00 KST 라
 * 같은 시각이면 기념일 알림과 추억 알림이 한꺼번에 뜬다.
 *
 * <p>하루 한 번만 돌므로 별도 발송 이력 없이 중복이 없다.
 * ⚠️ 단 <b>인스턴스가 2대 이상이면 커플마다 두 번 간다.</b> {@code CalendarDdayNotifier} ·
 * {@code PasswordResetTokenCleaner} 가 이미 단일 인스턴스를 가정하고 있어 같은 리스크를
 * 상속한다 — 스케일아웃 시 세 스케줄러를 함께 잠금으로 감싸야 한다.
 */
@Component
public class MemoriesNotifier {

    private static final Logger log = LoggerFactory.getLogger(MemoriesNotifier.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private static final String TITLE = "우리 추억";

    private final FeedPostRepository feedPostRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final RelationRepository relationRepository;
    private final NotificationService notificationService;
    private final ZoneId storageZone;
    private final PlanResolver planResolver;

    public MemoriesNotifier(FeedPostRepository feedPostRepository,
                            PlaceVisitRepository placeVisitRepository,
                            RelationRepository relationRepository,
                            NotificationService notificationService,
                            @Value("${fitto.storage-zone:}") String storageZone,
                            PlanResolver planResolver) {
        this.feedPostRepository = feedPostRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.relationRepository = relationRepository;
        this.notificationService = notificationService;
        // MemoriesService 와 반드시 같은 규칙으로 푼다 — 다르면 "푸시는 왔는데 열면 비어 있다"
        this.storageZone = MemoryDates.storageZoneOf(storageZone);
        this.planResolver = planResolver;
    }

    /** 매일 10:00 KST. */
    @Scheduled(cron = "0 0 10 * * *", zone = "Asia/Seoul")
    public void notifyTodayMemories() {
        notifyTodayMemories(LocalDate.now(KST));
    }

    /** 기준일을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다. */
    @Transactional(readOnly = true)
    public void notifyTodayMemories(LocalDate today) {
        Map<Long, CoupleMemory> targets = memoriesOn(today);
        if (targets.isEmpty()) {
            return;
        }

        int sent = 0;
        for (Map.Entry<Long, CoupleMemory> e : targets.entrySet()) {
            Relation couple = relationRepository.findById(e.getKey()).orElse(null);
            // 연결이 끊긴 관계의 기록은 보이지 않는 상태 — 알림도 보내지 않는다
            if (couple == null || couple.getStatus() != RelationStatus.ACTIVE) {
                continue;
            }
            // 열어봐야 잠겨 있는 알림은 보내지 않는다 — 추억은 PRO 기능이다.
            // (MEMORIES 는 커플 단위 판정이라 한쪽만 확인해도 관계 전체가 결정된다)
            if (planResolver.resolveFor(couple.getUserAId(), Feature.MEMORIES) != Plan.PRO) {
                continue;
            }
            String body = body(e.getValue());
            Map<String, String> data = Map.of("type", "memories");
            notificationService.notify(couple.getUserAId(), NotificationCategory.ANNIVERSARY, TITLE, body, data);
            notificationService.notify(couple.getUserBId(), NotificationCategory.ANNIVERSARY, TITLE, body, data);
            sent++;
        }
        log.info("추억 리마인드 푸시 — 대상 커플 {}건, 발송 {}건", targets.size(), sent);
    }

    /**
     * 그 날 추억이 있는 커플과 <b>가장 오래된 해</b>의 요약.
     *
     * <p>테스트에서 직접 검증할 수 있게 분리했다
     * ({@code CalendarDdayNotifier.eventsOccurringOn} 과 같은 이유).
     *
     * <p>가장 오래된 해를 고르는 건 그게 가장 회상 가치가 크기 때문이고, 개수도 <b>그 해 것만</b>
     * 센다 — 여러 해를 합쳐 세면 "3년 전 오늘"이라 해놓고 작년 기록까지 세는 문구가 된다.
     */
    public Map<Long, CoupleMemory> memoriesOn(LocalDate today) {
        Integer earliestYear = globalEarliestYear();
        if (earliestYear == null || earliestYear >= today.getYear()) {
            return Map.of();
        }

        Map<Long, CoupleMemory> byCouple = new LinkedHashMap<>();
        // 오래된 해부터 훑고 putIfAbsent — 커플마다 가장 오래된 해가 남는다
        for (int year = earliestYear; year < today.getYear(); year++) {
            Map<Long, Long> counts = countsForYear(year, today);
            int yearsAgo = today.getYear() - year;
            counts.forEach((coupleId, count) ->
                    byCouple.putIfAbsent(coupleId, new CoupleMemory(yearsAgo, count)));
        }
        return byCouple;
    }

    /** 한 해의 커플별 아이템 수 — 윤년 보정이 걸리면 두 날짜를 합산한다. */
    private Map<Long, Long> countsForYear(int year, LocalDate today) {
        Map<Long, Long> counts = new LinkedHashMap<>();
        for (LocalDate date : MemoryDates.occurrencesIn(year, today)) {
            LocalDateTime from = MemoryDates.storageStartOfDay(date, storageZone);
            LocalDateTime to = MemoryDates.storageStartOfDay(date.plusDays(1), storageZone);
            feedPostRepository.countByCoupleInPeriod(from, to)
                    .forEach(c -> counts.merge(c.getCoupleId(), c.getItemCount(), Long::sum));
            placeVisitRepository.countByCoupleOnVisitedAt(date)
                    .forEach(c -> counts.merge(c.getCoupleId(), c.getItemCount(), Long::sum));
        }
        return counts;
    }

    /** 훑을 연도의 하한 — 전체를 통틀어 가장 오래된 기록의 연도. 기록이 없으면 null. */
    private Integer globalEarliestYear() {
        LocalDateTime firstPost = feedPostRepository.findGlobalEarliestCreatedAt();
        LocalDate firstVisit = placeVisitRepository.findGlobalEarliestVisitedAt();

        Integer earliest = firstPost != null ? firstPost.getYear() : null;
        if (firstVisit != null) {
            earliest = (earliest == null) ? firstVisit.getYear() : Math.min(earliest, firstVisit.getYear());
        }
        return earliest;
    }

    private String body(CoupleMemory memory) {
        return memory.yearsAgo() + "년 전 오늘, 둘이 함께한 기록이 " + memory.itemCount() + "개 있어요 💐";
    }

    /** 커플의 가장 오래된 해 추억 요약 — 푸시 문구용. */
    public record CoupleMemory(int yearsAgo, long itemCount) {
    }
}
