package com.fitto.diet.domain;

import com.fitto.common.domain.BaseTimeEntity;
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

import java.time.LocalDate;

/**
 * 식단 찌르기 한 번 — 보낸 사람·받은 사람·그날(KST). 하루 한 번은 {@code (sender_id, nudge_date)} 유니크가 지킨다(V120).
 */
@Entity
@Table(name = "meal_nudges")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MealNudge extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    @Column(name = "receiver_id", nullable = false)
    private Long receiverId;

    @Column(name = "nudge_date", nullable = false)
    private LocalDate nudgeDate;

    @Builder
    private MealNudge(Long relationId, Long senderId, Long receiverId, LocalDate nudgeDate) {
        this.relationId = relationId;
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.nudgeDate = nudgeDate;
    }
}
