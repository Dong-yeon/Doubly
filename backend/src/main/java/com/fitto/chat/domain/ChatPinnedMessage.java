package com.fitto.chat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 공지 고정 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §3.
 *
 * <p>관계당 <b>한 행만</b> 존재한다(UNIQUE(relation_id), V77) — 북마크(여러 개 쌓이는
 * "나중에 볼 것")와 달리 공지는 "지금 필요한 것" 하나뿐이다. 그래서 새 메시지로 바꿀
 * 때는 행을 새로 만들지 않고 {@link #replace} 로 기존 행을 갱신한다.
 */
@Entity
@Table(name = "chat_pinned_messages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatPinnedMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false, unique = true)
    private Long relationId;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "pinned_by", nullable = false)
    private Long pinnedBy;

    @Column(name = "pinned_at", nullable = false)
    private LocalDateTime pinnedAt;

    @Builder
    private ChatPinnedMessage(Long relationId, Long messageId, Long pinnedBy) {
        this.relationId = relationId;
        this.messageId = messageId;
        this.pinnedBy = pinnedBy;
        this.pinnedAt = LocalDateTime.now();
    }

    /** 다른 메시지로 고정을 교체 — 행은 그대로 두고 내용만 바꾼다. */
    public void replace(Long messageId, Long pinnedBy) {
        this.messageId = messageId;
        this.pinnedBy = pinnedBy;
        this.pinnedAt = LocalDateTime.now();
    }
}
