package com.fitto.relation.domain;

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
 * 관계 멤버십 — 관계 모델 N인 확장 1단계 (README "관계 모델").
 *
 * <p>커플/트레이너는 relations.user_a_id / user_b_id 를 유지한 채 여기에도 함께 기록하고(이중 기록),
 * FAMILY(N인) 관계는 이 테이블이 멤버십의 원천이다.
 */
@Entity
@Table(name = "relation_members")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RelationMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_role", nullable = false, length = 20)
    private MemberRole memberRole;

    @CreatedDate
    @Column(name = "joined_at", nullable = false, updatable = false)
    private LocalDateTime joinedAt;

    @Builder
    private RelationMember(Long relationId, Long userId, MemberRole memberRole) {
        this.relationId = relationId;
        this.userId = userId;
        this.memberRole = memberRole;
    }
}
