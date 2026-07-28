package com.fitto.chat.repository;

import com.fitto.chat.domain.ChatMessageReaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMessageReactionRepository extends JpaRepository<ChatMessageReaction, Long> {

    /** 메시지 목록의 리액션 일괄 조회 — 메시지마다 개별 쿼리하면 N+1 이 된다 */
    List<ChatMessageReaction> findByMessageIdIn(List<Long> messageIds);

    List<ChatMessageReaction> findByMessageId(Long messageId);

    Optional<ChatMessageReaction> findByMessageIdAndUserIdAndEmoji(Long messageId, Long userId, String emoji);

    /** 관계의 메시지에 달린 리액션 전체 삭제 — 탈퇴·기록 삭제에서 사용 */
    @Modifying
    @Query("""
            delete from ChatMessageReaction r where r.messageId in
              (select m.id from ChatMessage m where m.relationId = :relationId)
            """)
    void deleteByRelationId(@Param("relationId") Long relationId);
}
