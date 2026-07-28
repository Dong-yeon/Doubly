package com.fitto.chat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 채팅 메시지 — 설계서 5.8 chat_messages. created_at 만 존재.
 */
@Entity
@Table(name = "chat_messages")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 20)
    private MessageType messageType;

    @Column(columnDefinition = "text")
    private String content;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @Column(name = "workout_id")
    private Long workoutId;

    @Column(name = "routine_id")
    private Long routineId;

    @Column(name = "is_read", nullable = false)
    private boolean isRead;

    /** 답장 대상 메시지 — 원본이 삭제되면 NULL 로 끊긴다(답장 자체는 남는다) */
    @Column(name = "reply_to_id")
    private Long replyToId;

    /** 수정 시각 — null 이면 수정된 적 없음 */
    @Column(name = "edited_at")
    private LocalDateTime editedAt;

    /**
     * 삭제 시각 — null 이면 살아있는 메시지.
     * 행을 지우지 않는 이유: 이 메시지를 인용한 답장과 리액션의 참조가 깨지고,
     * 페이지네이션 커서(id 기준)에 구멍이 생긴다. 표시만 바꾼다.
     */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ChatMessage(Long relationId, Long senderId, MessageType messageType,
                        String content, String imageUrl, Long workoutId, Long routineId,
                        Long replyToId) {
        this.relationId = relationId;
        this.senderId = senderId;
        this.messageType = messageType != null ? messageType : MessageType.TEXT;
        this.content = content;
        this.imageUrl = imageUrl;
        this.workoutId = workoutId;
        this.routineId = routineId;
        this.replyToId = replyToId;
        this.isRead = false;
    }

    public void markRead() {
        this.isRead = true;
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    /** 본문 수정 — 텍스트 메시지만 대상이며 호출자가 작성자 여부를 확인한다. */
    public void edit(String newContent) {
        this.content = newContent;
        this.editedAt = LocalDateTime.now();
    }

    /** 삭제 표시 — 본문·이미지를 비워 내용이 남지 않게 한다. */
    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
        this.content = null;
        this.imageUrl = null;
    }
}
