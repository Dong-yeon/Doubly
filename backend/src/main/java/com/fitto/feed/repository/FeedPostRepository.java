package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedPost;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface FeedPostRepository extends JpaRepository<FeedPost, Long> {

    /** 타임라인 — 커서(createdAt) 이전 포스트, 최신순. */
    @Query("""
            select p from FeedPost p
            where p.coupleId = :coupleId and p.createdAt < :cursor
            order by p.createdAt desc
            """)
    List<FeedPost> findTimeline(@Param("coupleId") Long coupleId,
                                @Param("cursor") LocalDateTime cursor,
                                Pageable pageable);

    /** 여행 앨범 — 해당 여행에 담긴 포스트, 최신순. */
    List<FeedPost> findByTripIdOrderByCreatedAtDescIdDesc(Long tripId);

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
