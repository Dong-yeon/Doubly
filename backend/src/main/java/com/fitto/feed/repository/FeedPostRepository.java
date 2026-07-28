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
