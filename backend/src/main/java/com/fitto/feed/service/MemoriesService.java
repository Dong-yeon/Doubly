package com.fitto.feed.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.MemoriesResponse;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 추억 리마인드 — "작년 오늘" (PLAN.md Memories).
 *
 * <p>오늘과 같은 월·일의 <b>1년 이상 전</b> 기록을 연도별로 묶어 돌려준다.
 * 신규 테이블 없이 기존 {@code feed_posts} · {@code place_visits} 를 다시 읽는다.
 *
 * <p><b>대상은 POST · PLACE_VISIT 둘뿐이다.</b> 운동·식단은 1년 뒤에 회상 가치가 없고
 * 거의 매일 있어 추억을 노이즈로 덮는다. 게다가 그 둘은 커플이 아니라 사용자 스코프라
 * "우리 추억"의 경계도 흐려진다.
 */
@Service
@Transactional(readOnly = true)
public class MemoriesService {

    private static final Logger log = LoggerFactory.getLogger(MemoriesService.class);

    /** 한 번에 내려주는 아이템 상한 — 넘으면 최신 연도부터 채우고 자른다. */
    private static final int MAX_ITEMS = 30;

    private final FeedPostRepository feedPostRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final RelationRepository relationRepository;
    private final FeedItemMapper mapper;

    /**
     * {@code created_at} 이 어느 TZ 벽시계로 적혔는지 — {@link MemoryDates#storageStartOfDay} 참고.
     * 기본값은 JVM 기본 TZ 이고, 컨테이너 TZ 가 바뀌면 {@code FITTO_STORAGE_ZONE} 으로 고정할 수 있다.
     */
    private final ZoneId storageZone;

    public MemoriesService(FeedPostRepository feedPostRepository,
                           PlaceVisitRepository placeVisitRepository,
                           RelationRepository relationRepository,
                           FeedItemMapper mapper,
                           @Value("${fitto.storage-zone:}") String storageZone) {
        this.feedPostRepository = feedPostRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.relationRepository = relationRepository;
        this.mapper = mapper;
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

        Integer earliestYear = earliestRecordYear(couple.getId());
        if (earliestYear == null || earliestYear >= today.getYear()) {
            // 기록이 없거나 전부 올해 것 — 추억이 될 만큼 오래된 게 없다
            return new MemoriesResponse(today, 0, List.of());
        }

        Long partnerId = couple.partnerOf(userId);
        Map<Long, String> names = mapper.userNames(
                partnerId != null ? List.of(userId, partnerId) : List.of(userId));

        List<MemoryGroupResponse> groups = new ArrayList<>();
        int total = 0;
        boolean cut = false;

        int year = today.getYear() - 1;
        for (; year >= earliestYear && total < MAX_ITEMS; year--) {
            List<FeedItemResponse> items = itemsOn(couple.getId(), year, today, names, userId);
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
        return new MemoriesResponse(today, total, groups);
    }

    /** 한 연도의 아이템 — 윤년 보정이 걸리면 두 날짜를 함께 읽어 한 그룹으로 묶는다. */
    private List<FeedItemResponse> itemsOn(Long coupleId, int year, LocalDate today,
                                           Map<Long, String> names, Long viewerId) {
        List<FeedItemResponse> items = new ArrayList<>();
        for (LocalDate date : MemoryDates.occurrencesIn(year, today)) {
            LocalDateTime from = MemoryDates.storageStartOfDay(date, storageZone);
            LocalDateTime to = MemoryDates.storageStartOfDay(date.plusDays(1), storageZone);
            for (FeedPost p : feedPostRepository.findInPeriod(coupleId, from, to)) {
                items.add(mapper.toItem(p, names, viewerId, null));
            }
            for (VisitWithPlace v : placeVisitRepository.findByCoupleAndVisitedAt(coupleId, date)) {
                // 방문은 등록 시각이 아니라 방문일 기준 — 어제 다녀와 오늘 등록해도 어제의 추억이다
                items.add(mapper.toItem(v, names, viewerId, true));
            }
        }
        items.sort(Comparator.comparing(FeedItemResponse::occurredAt)
                .thenComparing(FeedItemResponse::refId)
                .reversed());
        return mapper.attachReactions(items, viewerId);
    }

    /**
     * 훑어볼 연도의 하한 — 커플의 첫 기록 연도. 기록이 하나도 없으면 null.
     *
     * <p>포스트 쪽 값은 저장 TZ 의 벽시계라 연말·연초에 한 해 어긋날 수 있지만,
     * <b>하한으로만 쓰므로</b> 최악의 경우 빈 범위 조회가 한 번 더 도는 것이 전부다.
     */
    private Integer earliestRecordYear(Long coupleId) {
        LocalDateTime firstPost = feedPostRepository.findEarliestCreatedAt(coupleId);
        LocalDate firstVisit = placeVisitRepository.findEarliestVisitedAt(coupleId);

        Integer earliest = firstPost != null ? firstPost.getYear() : null;
        if (firstVisit != null) {
            earliest = (earliest == null) ? firstVisit.getYear() : Math.min(earliest, firstVisit.getYear());
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
