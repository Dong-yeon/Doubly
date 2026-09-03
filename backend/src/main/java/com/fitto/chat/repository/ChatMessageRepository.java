package com.fitto.chat.repository;

import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    /** 방 메시지 — 커서(id) 기반 최신순 페이징. */
    @Query("""
            select m from ChatMessage m
            where m.relationId = :relationId and (cast(:cursor as Long) is null or m.id < :cursor)
            order by m.id desc
            """)
    List<ChatMessage> findMessages(@Param("relationId") Long relationId,
                                   @Param("cursor") Long cursor,
                                   Pageable pageable);

    Optional<ChatMessage> findTopByRelationIdOrderByIdDesc(Long relationId);

    /**
     * 대화 검색 — 텍스트 메시지 본문에 키워드가 포함된 것만, 최신순 커서 페이징.
     * STICKER/TOUCH 등은 content 가 사람이 읽는 문장이 아니라 코드값이라 검색 대상에서 뺀다.
     * keyword 는 호출자(ChatService)가 LIKE 와일드카드를 이스케이프해서 넘긴다.
     */
    @Query("""
            select m from ChatMessage m
            where m.relationId = :relationId
              and m.messageType = com.fitto.chat.domain.MessageType.TEXT
              and m.deletedAt is null
              and lower(m.content) like lower(concat('%', :keyword, '%')) escape '\\'
              and (cast(:cursor as Long) is null or m.id < :cursor)
            order by m.id desc
            """)
    List<ChatMessage> searchMessages(@Param("relationId") Long relationId,
                                     @Param("keyword") String keyword,
                                     @Param("cursor") Long cursor,
                                     Pageable pageable);

    /** 내가 받은(상대가 보낸) 가장 최근 특정 타입 메시지 — 가상 터치 latest 조회에 쓴다. */
    Optional<ChatMessage> findTopByRelationIdAndMessageTypeAndSenderIdNotOrderByIdDesc(
            Long relationId, MessageType messageType, Long senderId);

    /** 내가 받은(상대가 보낸) 안 읽은 메시지 수 */
    long countByRelationIdAndSenderIdNotAndIsReadFalse(Long relationId, Long senderId);

    /** 특정 메시지까지(이하) 상대가 보낸 메시지를 읽음 처리 */
    @Modifying
    @Query("""
            update ChatMessage m set m.isRead = true
            where m.relationId = :relationId and m.id <= :messageId
              and m.senderId <> :readerId and m.isRead = false
            """)
    void markReadUpTo(@Param("relationId") Long relationId,
                      @Param("messageId") Long messageId,
                      @Param("readerId") Long readerId);

    /** 회원 탈퇴 시 본인이 속한 관계의 모든 메시지 삭제 */
    @Modifying
    @Query("""
            delete from ChatMessage m where m.relationId in
              (select r.id from Relation r where r.userAId = :userId or r.userBId = :userId)
            """)
    void deleteAllByUserRelations(@Param("userId") Long userId);
}
