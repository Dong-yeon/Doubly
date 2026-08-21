package com.fitto.streak.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 스트릭 — 설계서 5.9 streaks. updated_at 만 존재(created_at 없음).
 * 개인(user_id) 또는 커플(relation_id) 중 하나로 식별.
 */
@Entity
@Table(name = "streaks", uniqueConstraints = {
        @UniqueConstraint(name = "uq_streaks_user_type", columnNames = {"user_id", "streak_type"}),
        @UniqueConstraint(name = "uq_streaks_relation_type", columnNames = {"relation_id", "streak_type"})
})
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Streak {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "relation_id")
    private Long relationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "streak_type", nullable = false, length = 20)
    private StreakType streakType;

    @Column(name = "current_count", nullable = false)
    private int currentCount;

    @Column(name = "max_count", nullable = false)
    private int maxCount;

    @Column(name = "last_workout_date")
    private LocalDate lastWorkoutDate;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Streak(Long userId, Long relationId, StreakType streakType) {
        this.userId = userId;
        this.relationId = relationId;
        this.streakType = streakType;
        this.currentCount = 0;
        this.maxCount = 0;
    }

    public static Streak personal(Long userId) {
        return Streak.builder().userId(userId).streakType(StreakType.PERSONAL).build();
    }

    public static Streak couple(Long relationId) {
        return Streak.builder().relationId(relationId).streakType(StreakType.COUPLE).build();
    }

    public static Streak personalMeal(Long userId) {
        return Streak.builder().userId(userId).streakType(StreakType.PERSONAL_MEAL).build();
    }

    public static Streak coupleMeal(Long relationId) {
        return Streak.builder().relationId(relationId).streakType(StreakType.COUPLE_MEAL).build();
    }

    /**
     * 해당 날짜의 운동을 반영. 앞으로 이어지면(+1일) 증가, 끊겼으면 1로 리셋.
     *
     * <p>소급 입력(예: 오늘 먼저 기록한 뒤 어제를 나중에 채워 넣는 경우)이라도
     * <b>현재 연속 구간의 시작 바로 앞날</b>이면 뒤로 이어붙인다. 이미 연속 구간
     * 안에 든 날짜(오늘 중복 저장 등)는 무시한다 — {@link #lastWorkoutDate} 는
     * {@link #liveCount} 판정이 의존하므로 소급 경로에서는 절대 뒤로 옮기지 않는다.
     */
    public void applyWorkout(LocalDate date) {
        if (lastWorkoutDate == null) {
            currentCount = 1;
            lastWorkoutDate = date;
            bumpMax();
            return;
        }
        if (date.isAfter(lastWorkoutDate)) {
            currentCount = date.equals(lastWorkoutDate.plusDays(1)) ? currentCount + 1 : 1;
            lastWorkoutDate = date;
            bumpMax();
            return;
        }
        // 소급 입력 — 연속 구간의 시작보다 정확히 하루 앞이면 뒤로 이어붙인다.
        // 그 외(구간 내부=중복, 또는 구간보다 더 먼 과거)는 변화 없음.
        LocalDate streakStart = lastWorkoutDate.minusDays(Math.max(currentCount - 1, 0));
        if (date.equals(streakStart.minusDays(1))) {
            currentCount += 1;
            bumpMax();
        }
    }

    private void bumpMax() {
        if (currentCount > maxCount) {
            maxCount = currentCount;
        }
    }

    /** 기준일(today) 시점의 살아있는 연속 일수. 마지막 운동이 어제/오늘이 아니면 끊긴 것(0). */
    public int liveCount(LocalDate today) {
        if (lastWorkoutDate == null) return 0;
        if (lastWorkoutDate.equals(today) || lastWorkoutDate.equals(today.minusDays(1))) {
            return currentCount;
        }
        return 0;
    }

    /**
     * 복구권으로 되살릴 수 있는 상태인가 — <b>어제 하루만</b> 비었을 때.
     *
     * <p>마지막 기록이 그저께({@code today - 2})면 어제 하루를 놓쳐 오늘 0으로 보이는
     * 상태다. 이틀 이상 비었으면 "이어붙이기"가 아니라 새로 시작하는 것이므로 대상이 아니다
     * — 복구권을 며칠씩 소급 적용하면 스트릭 숫자가 기록이 아니라 결제의 함수가 된다.
     */
    public boolean isRepairable(LocalDate today) {
        return lastWorkoutDate != null
                && currentCount > 0
                && lastWorkoutDate.equals(today.minusDays(2));
    }

    /**
     * 비어 있던 어제를 메워 연속을 잇는다 ({@code Feature.STREAK_REPAIR}).
     *
     * <p>메운 하루도 연속 일수에 <b>포함</b>한다 — "끊기지 않았다"가 복구권이 파는 것이고,
     * 하루를 빼고 이으면 사용자가 세는 숫자와 화면의 숫자가 어긋난다.
     *
     * @return 실제로 되살렸으면 true (대상이 아니면 아무것도 하지 않고 false)
     */
    public boolean repair(LocalDate today) {
        if (!isRepairable(today)) return false;
        currentCount += 1;
        lastWorkoutDate = today.minusDays(1);
        bumpMax();
        return true;
    }
}
