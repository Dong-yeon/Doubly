package com.fitto.content.repository;

import com.fitto.content.domain.ContentLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ContentLogRepository extends JpaRepository<ContentLog, Long> {

    List<ContentLog> findByContentIdOrderByIdDesc(Long contentId);

    /** 목록 화면의 커버(최근 관람 기록)용 배치 조회 — PlaceVisitRepository 와 같은 이유로 콘텐츠별 in 절 하나로 묶는다 */
    List<ContentLog> findByContentIdInOrderByContentIdAscIdDesc(List<Long> contentIds);

    /** 커플의 콘텐츠별 관람 요약 (횟수·평균 별점·최근 관람일) */
    @Query("""
            select l.contentId as contentId, count(l) as logCount,
                   avg(l.rating) as avgRating, max(l.watchedAt) as lastWatchedAt
            from ContentLog l
            where l.contentId in :contentIds
            group by l.contentId
            """)
    List<LogSummary> summarize(@Param("contentIds") List<Long> contentIds);

    interface LogSummary {
        Long getContentId();

        long getLogCount();

        Double getAvgRating();

        java.time.LocalDate getLastWatchedAt();
    }

    /**
     * 커플 피드 타임라인 — 커플 콘텐츠의 관람 기록(제목 포함), 커서 (createdAt, id) 이전 최신순.
     * cursorAt 이 null 이면 첫 페이지(전체 조회)다. PlaceVisitRepository#findRecentForFeed 와 같은 패턴.
     */
    @Query("""
            select l as log, c.title as contentTitle
            from ContentLog l join Content c on c.id = l.contentId
            where c.coupleId = :coupleId
              and (cast(:cursorAt as LocalDateTime) is null
                   or l.createdAt < :cursorAt
                   or (l.createdAt = :cursorAt and l.id < :cursorId))
            order by l.createdAt desc, l.id desc
            """)
    List<LogWithContent> findRecentForFeed(@Param("coupleId") Long coupleId,
                                           @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                           @Param("cursorId") Long cursorId,
                                           Pageable pageable);

    /**
     * 추억 리마인드 — 그 날 관람한 기록 (PLAN.md Memories). watched_at 은 DATE 라 시간대 보정이
     * 필요 없다. 피드 타임라인(findRecentForFeed)은 등록 시각(createdAt)을 쓰지만 추억은
     * 관람일이 기준이다 — PlaceVisitRepository#findByCoupleAndVisitedAt 과 같은 이유로 통일하지 않는다.
     */
    @Query("""
            select l as log, c.title as contentTitle
            from ContentLog l join Content c on c.id = l.contentId
            where c.coupleId = :coupleId and l.watchedAt = :watchedAt
            order by l.id desc
            """)
    List<LogWithContent> findByCoupleAndWatchedAt(@Param("coupleId") Long coupleId,
                                                  @Param("watchedAt") java.time.LocalDate watchedAt);

    /** 추억 조회의 하한 연도용 — 커플의 첫 관람일 (없으면 null). */
    @Query("""
            select min(l.watchedAt) from ContentLog l join Content c on c.id = l.contentId
            where c.coupleId = :coupleId
            """)
    java.time.LocalDate findEarliestWatchedAt(@Param("coupleId") Long coupleId);

    /**
     * 추억 푸시 대상 — 그 날 관람 기록이 있는 커플과 그 개수.
     * PlaceVisitRepository#countByCoupleOnVisitedAt 과 같은 이유로 기록 쪽에서 집계한다.
     */
    @Query("""
            select c.coupleId as coupleId, count(l) as itemCount
            from ContentLog l join Content c on c.id = l.contentId
            where l.watchedAt = :watchedAt
            group by c.coupleId
            """)
    List<CoupleItemCount> countByCoupleOnWatchedAt(@Param("watchedAt") java.time.LocalDate watchedAt);

    /** 전체를 통틀어 가장 오래된 관람일 — 스케줄러가 훑을 연도의 하한 (없으면 null). */
    @Query("select min(l.watchedAt) from ContentLog l")
    java.time.LocalDate findGlobalEarliestWatchedAt();

    interface CoupleItemCount {
        Long getCoupleId();

        long getItemCount();
    }

    interface LogWithContent {
        ContentLog getLog();

        String getContentTitle();
    }
}
