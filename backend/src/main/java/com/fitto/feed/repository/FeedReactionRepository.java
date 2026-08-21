package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedReaction;
import com.fitto.feed.dto.FeedItemType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FeedReactionRepository extends JpaRepository<FeedReaction, Long> {

    /**
     * 타임라인 한 페이지의 반응 일괄 조회 — <b>타입별로</b> 부른다.
     * (type, id) 를 한 번에 넘기지 않는 이유: id 공간이 테이블마다 달라
     * id 목록만 합쳐 조회하면 운동 3번의 반응이 식단 3번 카드에 붙는다.
     */
    List<FeedReaction> findByTargetTypeAndTargetIdIn(FeedItemType targetType, Collection<Long> targetIds);

    List<FeedReaction> findByTargetTypeAndTargetId(FeedItemType targetType, Long targetId);

    Optional<FeedReaction> findByTargetTypeAndTargetIdAndUserIdAndEmoji(
            FeedItemType targetType, Long targetId, Long userId, String emoji);

    /** 원본이 사라질 때 함께 — FK 가 없으므로(다형 참조) 호출부가 직접 지운다. */
    @Modifying
    void deleteByTargetTypeAndTargetId(FeedItemType targetType, Long targetId);

    /** 데이트 식단처럼 한 번에 여러 원본이 사라지는 경우. */
    @Modifying
    @Query("delete from FeedReaction r where r.targetType = :type and r.targetId in :ids")
    void deleteByTargetTypeAndTargetIdIn(@Param("type") FeedItemType type,
                                         @Param("ids") Collection<Long> ids);
}
