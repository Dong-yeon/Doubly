package com.fitto.journal.domain;

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
import java.time.LocalTime;

/**
 * 하루 기록 리마인드(V125, 옵트인) — 한 사람당 하나, 행이 없으면 꺼진 것이다.
 * {@code MealReminder} 와 같은 모양이다(켜기 = 생성/수정, 끄기 = 삭제).
 */
@Entity
@Table(name = "journal_reminders")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JournalReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "reminder_time", nullable = false)
    private LocalTime reminderTime;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private JournalReminder(Long userId, LocalTime reminderTime) {
        this.userId = userId;
        this.reminderTime = reminderTime;
    }

    public void updateTime(LocalTime reminderTime) {
        this.reminderTime = reminderTime;
    }
}
