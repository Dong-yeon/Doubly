package com.fitto.content.repository;

import com.fitto.content.domain.ContentLog;
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
}
