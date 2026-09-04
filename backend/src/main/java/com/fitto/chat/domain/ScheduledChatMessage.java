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
 * 예약 전송 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위.
 *
 * <p>{@link ScheduledChatMessageSweeper} 가 주기적으로 훑어 {@code scheduledAt} 이 지난
 * 행을 {@link com.fitto.chat.service.ChatService#send} 로 실제 발송하고 {@link #markSent}
 * 를 호출한다. 취소({@link #cancel})는 발송 전에만 가능 — 발송된 뒤에는 이미 채팅방에
 * 실체가 생겨(chat_messages 행) 이 테이블에서 되돌릴 방법이 없다(서비스가 방어한다).
 */
@Entity
@Table(name = "scheduled_chat_messages")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ScheduledChatMessage {

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

    @Column(name = "scheduled_at", nullable = false)
    private LocalDateTime scheduledAt;

    /** null 이면 아직 발송 전. */
    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    /** 발송 후 생긴 실제 chat_messages.id — 정보용(참고 §V76 마이그레이션 주석). */
    @Column(name = "sent_message_id")
    private Long sentMessageId;

    /** null 이 아니면 취소됨 — 스위퍼가 건너뛴다. */
    @Column(name = "canceled_at")
    private LocalDateTime canceledAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ScheduledChatMessage(Long relationId, Long senderId, MessageType messageType,
                                  String content, String imageUrl, LocalDateTime scheduledAt) {
        this.relationId = relationId;
        this.senderId = senderId;
        this.messageType = messageType;
        this.content = content;
        this.imageUrl = imageUrl;
        this.scheduledAt = scheduledAt;
    }

    public boolean isPending() {
        return sentAt == null && canceledAt == null;
    }

    public void markSent(Long sentMessageId) {
        this.sentAt = LocalDateTime.now();
        this.sentMessageId = sentMessageId;
    }

    public void cancel() {
        this.canceledAt = LocalDateTime.now();
    }
}
