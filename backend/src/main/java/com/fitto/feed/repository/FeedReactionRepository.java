package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedReaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FeedReactionRepository extends JpaRepository<FeedReaction, Long> {

    List<FeedReaction> findByPostIdIn(List<Long> postIds);

    List<FeedReaction> findByPostId(Long postId);

    Optional<FeedReaction> findByPostIdAndUserIdAndEmoji(Long postId, Long userId, String emoji);
}
