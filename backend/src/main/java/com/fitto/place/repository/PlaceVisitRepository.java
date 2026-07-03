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
}
