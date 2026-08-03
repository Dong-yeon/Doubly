package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedPost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface FeedPostRepository extends JpaRepository<FeedPost, Long> {

    /**
     * 타임라인 — 커서 (createdAt, id) 이전 포스트, 최신순.
     * id 보조키가 없으면 같은 시각의 포스트가 페이지 경계에서 누락된다.
     * cursorAt 이 null 이면 첫 페이지(전체 조회)다.
     *
     * <p><b>{@code cast(:cursorAt as LocalDateTime)} 를 지우지 말 것.</b>
     * 그냥 {@code :cursorAt is null} 로 쓰면 PostgreSQL 이 바인딩 파라미터의 타입을
     * 추론하지 못해 {@code could not determine data type of parameter} 로 쿼리를 거절한다
     * — 첫 페이지(cursorAt = null)마다 500 이 났다. H2 는 통과시키므로 테스트로는 안 잡힌다
     * (PostgreSQL 로 테스트 돌리는 법은 docs/RUNNING.md).
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and (cast(:cursorAt as LocalDateTime) is null
                   or p.createdAt < :cursorAt
                   or (p.createdAt = :cursorAt and p.id < :cursorId))
            order by p.createdAt desc, p.id desc
            """)
    List<FeedPost> findTimeline(@Param("coupleId") Long coupleId,
                                @Param("cursorAt") LocalDateTime cursorAt,
                                @Param("cursorId") Long cursorId,
                                Pageable pageable);

    /**
     * 전체 사진첩 — 사진 있는 커플 포스트만, 타임라인과 동일한 (createdAt, id) keyset.
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and p.imageUrl is not null
              and (cast(:cursorAt as LocalDateTime) is null
                   or p.createdAt < :cursorAt
                   or (p.createdAt = :cursorAt and p.id < :cursorId))
            order by p.createdAt desc, p.id desc
            """)
    List<FeedPost> findPhotos(@Param("coupleId") Long coupleId,
                              @Param("cursorAt") LocalDateTime cursorAt,
                              @Param("cursorId") Long cursorId,
                              Pageable pageable);

    /**
     * 추억 리마인드 — 하루 범위의 포스트 (PLAN.md Memories).
     *
     * <p><b>{@code extract(month from created_at)} 같은 함수 조건으로 쓰지 말 것.</b>
     * 인덱스 {@code idx_feed_posts_couple (couple_id, created_at DESC)} 를 타지 못해
     * 커플의 전체 포스트를 스캔하고, PostgreSQL·H2 의 날짜 함수 방언 차이까지 떠안는다.
     * 반각 범위 {@code [from, to)} 로 조회하면 인덱스를 그대로 쓴다.
     *
     * <p>여기서는 {@code cast(:param as LocalDateTime)} 이 필요 없다 — 두 파라미터 모두
     * 절대 null 이 아니라 타입 추론이 실패할 자리가 없다 (첫 페이지 null 을 다루는
     * {@link #findTimeline} 과 다른 점).
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and p.createdAt >= :from and p.createdAt < :to
            order by p.createdAt desc, p.id desc
            """)
    List<FeedPost> findInPeriod(@Param("coupleId") Long coupleId,
                                @Param("from") LocalDateTime from,
                                @Param("to") LocalDateTime to);

    /**
     * 추억 조회의 하한 연도용 — 커플의 첫 포스트 시각 (없으면 null).
     *
     * <p>관계 생성일({@code relations.connected_at})을 하한으로 쓸 수 없다 —
     * 재회 후 불러오기(RelationRecordRestorer)가 옛 포스트의 {@code couple_id} 를
     * 새 관계로 옮기므로, 기록이 관계보다 앞설 수 있다.
     */
    @Query("select min(p.createdAt) from FeedPost p where p.coupleId = :coupleId")
    LocalDateTime findEarliestCreatedAt(@Param("coupleId") Long coupleId);

    /**
     * 추억 푸시 대상 — 하루 범위에 포스트가 있는 <b>커플과 그 개수</b>.
     *
     * <p>스케줄러는 커플을 하나씩 돌며 묻지 않는다. 커플 수만큼 쿼리가 늘기 때문이다.
     * 기록 쪽에서 한 번에 집계해 대상 커플을 뽑는다
     * ({@code CalendarDdayNotifier} 가 일정에서 커플을 역으로 찾는 것과 같은 방향).
     */
    @Query("""
            select p.coupleId as coupleId, count(p) as itemCount
            from FeedPost p
            where p.createdAt >= :from and p.createdAt < :to
            group by p.coupleId
            """)
    List<CoupleItemCount> countByCoupleInPeriod(@Param("from") LocalDateTime from,
                                                @Param("to") LocalDateTime to);

    /** 전체를 통틀어 가장 오래된 포스트 — 스케줄러가 훑을 연도의 하한 (없으면 null). */
    @Query("select min(p.createdAt) from FeedPost p")
    LocalDateTime findGlobalEarliestCreatedAt();

    interface CoupleItemCount {
        Long getCoupleId();

        long getItemCount();
    }

    /** 여행 앨범 — 해당 여행에 담긴 포스트, 최신순. */
    List<FeedPost> findByTripIdOrderByCreatedAtDescIdDesc(Long tripId);

    /** 여행 앨범 사진 수 (회고 카드) */
    long countByTripId(Long tripId);

    /**
     * 앨범 담기 후보 — 사진이 있고 이 여행에 담기지 않은 커플 포스트(다른 여행 것은 옮길 수 있게 포함).
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId and p.imageUrl is not null
              and (p.tripId is null or p.tripId <> :tripId)
            order by p.createdAt desc, p.id desc
            """)
    List<FeedPost> findAlbumCandidates(@Param("coupleId") Long coupleId,
                                       @Param("tripId") Long tripId,
                                       Pageable pageable);
}
