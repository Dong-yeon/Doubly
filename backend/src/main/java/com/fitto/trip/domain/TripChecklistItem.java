package com.fitto.trip.domain;

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
 * 커플 여행 준비물 항목 — PLAN.md Trip Checklist. 커플 둘 다 추가/체크/수정/삭제할 수 있고,
 * 체크한 사람(checkedBy)을 남겨 "누가 챙겼는지" 보여준다.
 */
@Entity
@Table(name = "trip_checklist_items")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TripChecklistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trip_id", nullable = false)
    private Long tripId;

    @Column(nullable = false, length = 200)
    private String content;

    @Column(nullable = false)
    private boolean checked;

    /** 체크한 사람 — 미체크면 null */
    @Column(name = "checked_by")
    private Long checkedBy;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TripChecklistItem(Long tripId, String content, int sortOrder, Long createdBy) {
        this.tripId = tripId;
        this.content = content;
        this.checked = false;
        this.sortOrder = sortOrder;
        this.createdBy = createdBy;
    }

    /** 이름 수정 (커플 둘 다 가능) */
    public void rename(String content) {
        if (content != null && !content.isBlank()) {
            this.content = content;
        }
    }

    /** 체크 토글 — 체크 시 체크한 사람 기록, 해제 시 비움 */
    public void toggle(Long userId) {
        if (this.checked) {
            this.checked = false;
            this.checkedBy = null;
        } else {
            this.checked = true;
            this.checkedBy = userId;
        }
    }
}
