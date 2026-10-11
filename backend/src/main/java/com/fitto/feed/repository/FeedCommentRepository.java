package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedComment;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 삭제(탈퇴·지난 기록 삭제)는 여기 두지 않는다 — Purger 가 원시 SQL 로 순서를 관리한다
 * ({@code MoodStatusRepository} 주석과 같은 이유).
 */
public interface FeedCommentRepository extends JpaRepository<FeedComment, Long> {

    /** 포스트의 댓글, 오래된 순 — 대화처럼 읽힌다. 상한은 호출부가 Pageable 로 건다 */
    List<FeedComment> findByPostIdOrderByCreatedAtAscIdAsc(Long postId, Pageable pageable);

    /** 카드의 댓글 수 — 한 페이지의 포스트를 한 번에 센다(행마다 세면 N+1) */
    @Query("""
            select c.postId as postId, count(c) as count
            from FeedComment c
            where c.postId in :postIds
            group by c.postId
            """)
    List<PostCommentCount> countByPostIds(@Param("postIds") List<Long> postIds);

    interface PostCommentCount {
        Long getPostId();

        long getCount();
    }
}
