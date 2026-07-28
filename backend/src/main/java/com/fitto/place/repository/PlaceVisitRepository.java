package com.fitto.place.repository;

import com.fitto.place.domain.PlaceVisit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlaceVisitRepository extends JpaRepository<PlaceVisit, Long> {

    List<PlaceVisit> findByPlaceIdOrderByIdDesc(Long placeId);

    /** 커플의 장소별 방문 요약 (횟수·평균 별점·최근 방문일) */
    @Query("""
            select v.placeId as placeId, count(v) as visitCount,
                   avg(v.rating) as avgRating, max(v.visitedAt) as lastVisitedAt
            from PlaceVisit v
            where v.placeId in :placeIds
            group by v.placeId
            """)
    List<VisitSummary> summarize(@Param("placeIds") List<Long> placeIds);

    interface VisitSummary {
        Long getPlaceId();

        long getVisitCount();

        Double getAvgRating();

        java.time.LocalDate getLastVisitedAt();
    }

    /**
     * 커플 피드 타임라인 — 커플 장소의 방문 기록(장소명 포함), 커서 (createdAt, id) 이전 최신순.
     * cursorAt 이 null 이면 첫 페이지(전체 조회)다.
     */
    @Query("""
            select v as visit, p.name as placeName
            from PlaceVisit v join Place p on p.id = v.placeId
            where p.coupleId = :coupleId
              and (cast(:cursorAt as LocalDateTime) is null
                   or v.createdAt < :cursorAt
                   or (v.createdAt = :cursorAt and v.id < :cursorId))
            order by v.createdAt desc, v.id desc
            """)
    List<VisitWithPlace> findRecentForFeed(@Param("coupleId") Long coupleId,
                                           @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                           @Param("cursorId") Long cursorId,
                                           org.springframework.data.domain.Pageable pageable);

    interface VisitWithPlace {
        PlaceVisit getVisit();

        String getPlaceName();
    }
}
