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
}
