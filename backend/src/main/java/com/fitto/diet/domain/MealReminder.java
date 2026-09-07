package com.fitto.diet.domain;

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
import java.time.LocalTime;

/**
 * 끼니 알림 — 사용자가 등록한 시간에 "오늘 이 끼니 기록했나요?" 를 묻는다.
 *
 * <p>{@link com.fitto.reengagement.ReengagementNotifier} 의 스트릭 위기 알림과는 결이 다르다 —
 * 그쪽은 스트릭이 3일 이상 쌓인 사람에게 저녁에 한 번, 이쪽은 스트릭과 무관하게
 * <b>본인이 정한 식사 시간</b>마다 온다(하루 최대 3통이어도 본인이 고른 빈도다).
 *
 * <p>별도 {@code enabled} 컬럼을 두지 않는다 — 행이 있으면 그 끼니 알림이 켜진 것,
 * 없으면 꺼진 것이다(끄기=삭제, 켜기=생성/수정). {@link MealType#SNACK} 은 지원하지 않는다
 * — 정해진 시간이 없는 끼니라 리마인드가 의미 없다({@link com.fitto.diet.service.MealReminderService}
 * 에서 검증).
 */
@Entity
@Table(name = "meal_reminders")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MealReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private MealType mealType;

    @Column(name = "reminder_time", nullable = false)
    private LocalTime reminderTime;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private MealReminder(Long userId, MealType mealType, LocalTime reminderTime) {
        this.userId = userId;
        this.mealType = mealType;
        this.reminderTime = reminderTime;
    }

    public void updateTime(LocalTime reminderTime) {
        this.reminderTime = reminderTime;
    }
}
