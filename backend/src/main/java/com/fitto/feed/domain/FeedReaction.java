package com.fitto.feed.domain;

import com.fitto.feed.dto.FeedItemType;
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
 * 피드 아이템 이모지 반응 — (targetType, targetId, user, emoji) 유니크, 재요청 시 토글(삭제).
 *
 * <p>대상은 일상 포스트뿐 아니라 <b>운동·식단·맛집 방문 카드</b>까지다. 타임라인에 나란히
 * 서 있는 카드인데 포스트에만 반응이 달리면, 정작 매일 쌓이는 기록에는 응원할 방법이 없다.
 *
 * <p>{@link FeedItemType} 은 DTO 패키지에 있지만 타임라인 전체가 공유하는 어휘라 그대로
 * 쓴다 — 같은 뜻의 열거형을 도메인에 하나 더 두면 둘이 어긋날 때 조용히 깨진다.
 *
 * <p><b>참조 무결성은 애플리케이션이 지킨다.</b> 대상 테이블이 넷이라 FK 를 걸 수 없으므로,
 * 원본을 지우는 모든 경로가 반응도 함께 지운다({@code V60__feed_reactions_all_types.sql} 주석).
 */
@Entity
@Table(name = "feed_reactions")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FeedReaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 20)
    private FeedItemType targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 10)
    private String emoji;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private FeedReaction(FeedItemType targetType, Long targetId, Long userId, String emoji) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.userId = userId;
        this.emoji = emoji;
    }
}
