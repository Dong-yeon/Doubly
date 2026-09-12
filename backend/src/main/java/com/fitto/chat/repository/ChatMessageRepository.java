package com.fitto.chat.repository;

import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
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
     * 사진 모아보기 — IMAGE 메시지만 최신순 커서 페이징. PRO_PLAN_DESIGN.md 가 이미
     * "우리 대화 갤러리"를 전면 무료로 못박아 뒀다(Feature 미등재) — 게이팅 없음.
     */
    @Query("""
            select m from ChatMessage m
            where m.relationId = :relationId
              and m.messageType = com.fitto.chat.domain.MessageType.IMAGE
              and m.deletedAt is null
              and (cast(:cursor as Long) is null or m.id < :cursor)
            order by m.id desc
            """)
    List<ChatMessage> findImages(@Param("relationId") Long relationId,
                                 @Param("cursor") Long cursor,
                                 Pageable pageable);

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

    /**
     * 대화 내보내기 — 지정 기간(from/to 각각 선택, 없으면 전체 기간) <b>최신순</b>으로
     * 상한만큼 가져온다. 화면에 보여줄 땐 사람이 읽는 순서(오래된순)로 뒤집어야 하지만
     * (ChatService.exportMessages 가 뒤집는다), 여기서 최신순으로 자르는 이유는 상한에
     * 걸렸을 때 <b>최근 대화가 남아야</b> 하기 때문이다 — 오래된순으로 자르면 정작
     * 필요한 최근 대화가 통째로 잘려나간다.
     */
    @Query("""
            select m from ChatMessage m
            where m.relationId = :relationId
              and (cast(:from as java.time.LocalDateTime) is null or m.createdAt >= :from)
              and (cast(:to as java.time.LocalDateTime) is null or m.createdAt < :to)
            order by m.id desc
            """)
    List<ChatMessage> findForExport(@Param("relationId") Long relationId,
                                    @Param("from") LocalDateTime from,
                                    @Param("to") LocalDateTime to,
                                    Pageable pageable);

    /** 위와 같은 조건의 전체 개수 — 상한에 걸려 잘렸는지(truncated) 판단하는 데 쓴다. */
    @Query("""
            select count(m) from ChatMessage m
            where m.relationId = :relationId
              and (cast(:from as java.time.LocalDateTime) is null or m.createdAt >= :from)
              and (cast(:to as java.time.LocalDateTime) is null or m.createdAt < :to)
            """)
    long countForExport(@Param("relationId") Long relationId,
                        @Param("from") LocalDateTime from,
                        @Param("to") LocalDateTime to);

    /** 회원 탈퇴 시 본인이 속한 관계의 모든 메시지 삭제 */
    @Modifying
    @Query("""
            delete from ChatMessage m where m.relationId in
              (select r.id from Relation r where r.userAId = :userId or r.userBId = :userId)
            """)
    void deleteAllByUserRelations(@Param("userId") Long userId);

    /**
     * 멱등키로 이미 저장된 메시지를 찾는다 — 같은 키로 두 번 들어온 프레임을 걸러낸다.
     * {@code (relation_id, client_message_id)} unique 인덱스가 이 조회를 받쳐 준다(V89).
     */
    Optional<ChatMessage> findByRelationIdAndClientMessageId(Long relationId, String clientMessageId);
}
