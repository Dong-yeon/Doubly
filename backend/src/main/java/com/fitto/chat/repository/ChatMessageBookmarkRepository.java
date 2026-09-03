package com.fitto.chat.repository;

import com.fitto.chat.domain.ChatMessageBookmark;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMessageBookmarkRepository extends JpaRepository<ChatMessageBookmark, Long> {

    /** 메시지 목록에 "저장됨" 표시를 붙이기 위한 일괄 조회 — 메시지마다 개별 쿼리하면 N+1 이 된다 */
    List<ChatMessageBookmark> findByMessageIdIn(List<Long> messageIds);

    Optional<ChatMessageBookmark> findByMessageId(Long messageId);

    boolean existsByMessageId(Long messageId);

    /** 저장한 대화 목록 — 저장한 시각 최신순 커서 페이징(id 는 저장 순서와 같다) */
    @Query("""
            select b from ChatMessageBookmark b
            where b.relationId = :relationId and (cast(:cursor as Long) is null or b.id < :cursor)
            order by b.id desc
            """)
    List<ChatMessageBookmark> findPage(@Param("relationId") Long relationId,
                                       @Param("cursor") Long cursor,
                                       Pageable pageable);
}
