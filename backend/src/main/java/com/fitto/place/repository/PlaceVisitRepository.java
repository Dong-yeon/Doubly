package com.fitto.place.repository;

import com.fitto.place.domain.PlaceVisit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlaceVisitRepository extends JpaRepository<PlaceVisit, Long> {

    List<PlaceVisit> findByPlaceIdOrderByIdDesc(Long placeId);

    /**
     * 럽슐랭 가이드 매거진 카드의 커버 사진/한줄평용 배치 조회 — 장소별로 최근 방문순.
     * place_id 로 in 절 하나만 날리고 "장소별 최근 방문(사진 있으면 그걸, 없으면 가장 최근
     * 것)" 선택은 서비스 레이어에서 그룹핑해 고른다(장소별 사진 유무가 갈려 SQL 한 줄로
     * 뽑기 애매함) — {@link #summarize} 와 같은 이유로 place 마다 개별 조회하지 않는다.
     */
    List<PlaceVisit> findByPlaceIdInOrderByPlaceIdAscIdDesc(List<Long> placeIds);

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

    /**
     * 추억 리마인드 — 그 날 방문한 기록 (PLAN.md Memories).
     *
     * <p>{@code visited_at} 은 {@code DATE} 라 시간대 보정이 필요 없고, "방문한 날"이라는
     * 의미도 정확하다. 피드 타임라인({@link #findRecentForFeed})은 등록 시각
     * {@code created_at} 을 쓰지만 추억은 방문일이 기준이다 — <b>통일하지 말 것.</b>
     * 어제 다녀와서 오늘 등록한 방문은 "어제의 추억"이어야 한다.
     */
    @Query("""
            select v as visit, p.name as placeName
            from PlaceVisit v join Place p on p.id = v.placeId
            where p.coupleId = :coupleId and v.visitedAt = :visitedAt
            order by v.id desc
            """)
    List<VisitWithPlace> findByCoupleAndVisitedAt(@Param("coupleId") Long coupleId,
                                                  @Param("visitedAt") java.time.LocalDate visitedAt);

    /** 추억 조회의 하한 연도용 — 커플의 첫 방문일 (없으면 null). */
    @Query("""
            select min(v.visitedAt) from PlaceVisit v join Place p on p.id = v.placeId
            where p.coupleId = :coupleId
            """)
    java.time.LocalDate findEarliestVisitedAt(@Param("coupleId") Long coupleId);

    /**
     * 추억 푸시 대상 — 그 날 방문 기록이 있는 커플과 그 개수.
     * 커플을 하나씩 도는 대신 기록 쪽에서 집계한다
     * ({@code FeedPostRepository.countByCoupleInPeriod} 와 같은 이유).
     */
    @Query("""
            select p.coupleId as coupleId, count(v) as itemCount
            from PlaceVisit v join Place p on p.id = v.placeId
            where v.visitedAt = :visitedAt
            group by p.coupleId
            """)
    List<CoupleItemCount> countByCoupleOnVisitedAt(@Param("visitedAt") java.time.LocalDate visitedAt);

    /** 전체를 통틀어 가장 오래된 방문일 — 스케줄러가 훑을 연도의 하한 (없으면 null). */
    @Query("select min(v.visitedAt) from PlaceVisit v")
    java.time.LocalDate findGlobalEarliestVisitedAt();

    interface CoupleItemCount {
        Long getCoupleId();

        long getItemCount();
    }

    interface VisitWithPlace {
        PlaceVisit getVisit();

        String getPlaceName();
    }
}
