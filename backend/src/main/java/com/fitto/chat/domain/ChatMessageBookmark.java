package com.fitto.chat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
 * 중요 대화 북마크 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §3.
 *
 * <p><b>커플 공용</b>이다 — 한쪽이 저장하면 둘 다 목록에서 본다({@code savedBy} 는
 * 누가 저장했는지 표시용일 뿐, 접근 범위를 나누지 않는다). 메시지당 한 번만 저장할
 * 수 있다(UNIQUE(message_id)) — "저장했나/안 했나"만 있고 여러 번 저장하는 개념이 없다.
 */
@Entity
@Table(name = "chat_message_bookmarks")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessageBookmark {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "saved_by", nullable = false)
    private Long savedBy;

    @Column(length = 200)
    private String memo;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ChatMessageBookmark(Long relationId, Long messageId, Long savedBy, String memo) {
        this.relationId = relationId;
        this.messageId = messageId;
        this.savedBy = savedBy;
        this.memo = memo;
    }
}
