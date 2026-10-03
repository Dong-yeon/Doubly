package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedPost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public interface FeedPostRepository extends JpaRepository<FeedPost, Long> {

    /** 저장 멱등 — 같은 작성자의 같은 키로 이미 저장된 글(V127) */
    java.util.Optional<FeedPost> findByAuthorIdAndClientRequestId(Long authorId, String clientRequestId);

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
     * 전체 사진첩 — 사진 있는 커플 포스트만, <b>(기록일, created_at, id) keyset</b>(V119).
     * 식단·운동·방문의 사진첩 쿼리와 같은 모양이라 지난 날짜로 올린 포스트도 그 날짜 자리에 섞인다.
     * 타임라인({@link #findTimeline})은 업로드 순서 그대로다 — 통일하지 말 것.
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and p.imageUrl is not null
              and (cast(:cursorDate as LocalDate) is null
                   or p.recordDate < :cursorDate
                   or (p.recordDate = :cursorDate
                       and (p.createdAt < :cursorAt
                            or (p.createdAt = :cursorAt and p.id < :cursorId))))
            order by p.recordDate desc, p.createdAt desc, p.id desc
            """)
    List<FeedPost> findPhotos(@Param("coupleId") Long coupleId,
                              @Param("cursorDate") LocalDate cursorDate,
                              @Param("cursorAt") LocalDateTime cursorAt,
                              @Param("cursorId") Long cursorId,
                              Pageable pageable);

    /**
     * 사진첩 작성자 필터(나/상대) — {@link #findPhotos} 에 작성자 조건만 더한다.
     *
     * <p>{@code :authorId is null} 로 한 쿼리에 합치지 않는다 — PostgreSQL 이 null 파라미터의
     * 타입을 정하지 못해 거절한다(CLAUDE.md 6절). 거르지 않을 때는 위 쿼리를 쓴다.
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and p.authorId = :authorId
              and p.imageUrl is not null
              and (cast(:cursorDate as LocalDate) is null
                   or p.recordDate < :cursorDate
                   or (p.recordDate = :cursorDate
                       and (p.createdAt < :cursorAt
                            or (p.createdAt = :cursorAt and p.id < :cursorId))))
            order by p.recordDate desc, p.createdAt desc, p.id desc
            """)
    List<FeedPost> findPhotosByAuthor(@Param("coupleId") Long coupleId,
                                      @Param("authorId") Long authorId,
                                      @Param("cursorDate") LocalDate cursorDate,
                                      @Param("cursorAt") LocalDateTime cursorAt,
                                      @Param("cursorId") Long cursorId,
                                      Pageable pageable);

    /**
     * 추억 리마인드 — 그 기록일의 포스트 (PLAN.md Memories).
     *
     * <p>V119 전에는 날짜 컬럼이 없어 KST 하루를 저장 TZ 벽시계 범위로 옮겨 {@code created_at} 으로 찾았다.
     * 이제 기록일 등호 하나다 — 시간대 보정이 필요 없고 인덱스 {@code idx_feed_posts_couple_record} 를 탄다.
     * {@code extract(month from …)} 같은 함수 조건은 여전히 쓰지 않는다(인덱스를 못 타고 방언이 갈린다).
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and p.recordDate = :date
            order by p.createdAt desc, p.id desc
            """)
    List<FeedPost> findOnRecordDate(@Param("coupleId") Long coupleId,
                                    @Param("date") LocalDate date);

    /**
     * 추억 조회의 하한 연도용 — 커플의 가장 이른 포스트 기록일 (없으면 null).
     *
     * <p>관계 생성일({@code relations.connected_at})을 하한으로 쓸 수 없다 —
     * 재회 후 불러오기(RelationRecordRestorer)가 옛 포스트의 {@code couple_id} 를
     * 새 관계로 옮기므로, 기록이 관계보다 앞설 수 있다.
     */
    @Query("select min(p.recordDate) from FeedPost p where p.coupleId = :coupleId")
    LocalDate findEarliestRecordDate(@Param("coupleId") Long coupleId);

    /**
     * 추억 푸시 대상 — 그 기록일에 포스트가 있는 <b>커플과 그 개수</b>.
     *
     * <p>스케줄러는 커플을 하나씩 돌며 묻지 않는다. 커플 수만큼 쿼리가 늘기 때문이다.
     * 기록 쪽에서 한 번에 집계해 대상 커플을 뽑는다
     * ({@code CalendarDdayNotifier} 가 일정에서 커플을 역으로 찾는 것과 같은 방향).
     */
    @Query("""
            select p.coupleId as coupleId, count(p) as itemCount
            from FeedPost p
            where p.recordDate = :date
            group by p.coupleId
            """)
    List<CoupleItemCount> countByCoupleOnRecordDate(@Param("date") LocalDate date);

    /** 전체를 통틀어 가장 오래된 포스트 — 스케줄러가 훑을 연도의 하한 (없으면 null). */
    @Query("select min(p.recordDate) from FeedPost p")
    LocalDate findGlobalEarliestRecordDate();

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

    /**
     * 사진첩 달력 — 기록일이 {@code [from, to]} 인 사진 포스트(V119 — 식단·운동의 같은 쿼리와 같은 모양).
     * 작성자 필터는 한 달치를 통째로 받으므로 서비스에서 거른다.
     */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId
              and p.imageUrl is not null
              and p.recordDate between :from and :to
            order by p.recordDate desc, p.createdAt desc, p.id desc
            """)
    List<FeedPost> findPhotosInDateRange(@Param("coupleId") Long coupleId,
                                         @Param("from") LocalDate from,
                                         @Param("to") LocalDate to,
                                         Pageable pageable);
}
