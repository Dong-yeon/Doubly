package com.fitto.character.domain;

import com.fitto.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * 커플 캐릭터 — relation(COUPLE) 당 1마리. 운동/식단 기록 시 성장치가 오르고,
 * 같은 날 둘 다 기록하면 보너스가 더 붙는다. {@link #decay} 로 장기 미기록 시 깎일 수 있다.
 *
 * 성장 단계는 이 엔티티가 아니라 조회 시 growth_point 에서 파생 계산한다(퇴화로 값이
 * 줄어들 수 있어 단계를 저장하면 드리프트가 생기기 때문 — LevelResponse 와 동일한 이유).
 */
@Entity
@Table(name = "couple_characters")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoupleCharacter extends BaseTimeEntity {

    // 하루 성장치 — 혼자 기록 vs 둘 다 기록(보너스). "둘 다"가 단순 합보다 크게 설계되어
    // 있다: 운동 기준 혼자 2 + 2(각자) vs 둘 다 2+2+3(보너스)=7.
    private static final int SOLO_WORKOUT_POINTS = 2;
    private static final int BOTH_WORKOUT_BONUS = 3;
    private static final int SOLO_MEAL_POINTS = 1;
    private static final int BOTH_MEAL_BONUS = 2;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false, unique = true)
    private Long relationId;

    @Column(name = "growth_point", nullable = false)
    private int growthPoint;

    @Column(name = "last_workout_growth_date")
    private LocalDate lastWorkoutGrowthDate;

    @Column(name = "workout_both_bonus_granted", nullable = false)
    private boolean workoutBothBonusGranted;

    @Column(name = "last_meal_growth_date")
    private LocalDate lastMealGrowthDate;

    @Column(name = "meal_both_bonus_granted", nullable = false)
    private boolean mealBothBonusGranted;

    @Column(name = "last_decayed_date")
    private LocalDate lastDecayedDate;

    private CoupleCharacter(Long relationId) {
        this.relationId = relationId;
        this.growthPoint = 0;
    }

    public static CoupleCharacter of(Long relationId) {
        return new CoupleCharacter(relationId);
    }

    /**
     * 운동 기록 반영. 그날 첫 반영이면 SOLO 만큼, 상대도 같은 날 기록했으면 즉시(또는
     * 나중에 상대가 완성하는 시점에) BOTH 보너스를 추가로 얹는다. 과거 날짜/중복 호출은 무시.
     */
    public void applyWorkoutGrowth(LocalDate date, boolean bothLoggedToday) {
        applyGrowth(date, bothLoggedToday, SOLO_WORKOUT_POINTS, BOTH_WORKOUT_BONUS,
                lastWorkoutGrowthDate, workoutBothBonusGranted, this::setWorkoutState);
    }

    /** 식단 기록 반영 — {@link #applyWorkoutGrowth} 와 동일한 규칙, 배점만 낮다. */
    public void applyMealGrowth(LocalDate date, boolean bothLoggedToday) {
        applyGrowth(date, bothLoggedToday, SOLO_MEAL_POINTS, BOTH_MEAL_BONUS,
                lastMealGrowthDate, mealBothBonusGranted, this::setMealState);
    }

    private void applyGrowth(LocalDate date, boolean bothLoggedToday, int soloPoints, int bothBonus,
                              LocalDate lastGrowthDate, boolean bonusGranted, GrowthStateSetter setState) {
        if (lastGrowthDate == null || date.isAfter(lastGrowthDate)) {
            // 오늘 첫 반영
            growthPoint += soloPoints + (bothLoggedToday ? bothBonus : 0);
            setState.apply(date, bothLoggedToday);
        } else if (date.equals(lastGrowthDate) && bothLoggedToday && !bonusGranted) {
            // 이미 한쪽은 반영됐고, 방금 상대가 같은 날짜를 완성 — 보너스만 추가
            growthPoint += bothBonus;
            setState.apply(date, true);
        }
        // date.isBefore(lastGrowthDate) 이거나 이미 다 반영된 경우는 무시
    }

    private void setWorkoutState(LocalDate date, boolean bonusGranted) {
        this.lastWorkoutGrowthDate = date;
        this.workoutBothBonusGranted = bonusGranted;
    }

    private void setMealState(LocalDate date, boolean bonusGranted) {
        this.lastMealGrowthDate = date;
        this.mealBothBonusGranted = bonusGranted;
    }

    /** 두 성장 트랙 중 더 최근 날짜 — 퇴화 배치가 "얼마나 방치됐는지" 판단하는 기준. */
    public LocalDate lastActiveDate() {
        if (lastWorkoutGrowthDate == null) return lastMealGrowthDate;
        if (lastMealGrowthDate == null) return lastWorkoutGrowthDate;
        return lastWorkoutGrowthDate.isAfter(lastMealGrowthDate) ? lastWorkoutGrowthDate : lastMealGrowthDate;
    }

    /**
     * 퇴화 — 마지막 활동일로부터 graceDays 를 넘겨 방치됐으면 growthPoint 를 깎는다(0 하한).
     * 배치는 매일 돈다고 가정하고, "마지막으로 깎은 지점 이후 새로 지난 날"만 차감한다
     * (매번 lastActiveDate 기준으로 누적 유휴일수를 다시 계산하면 이미 깎은 날짜까지
     * 중복으로 또 깎이는 compounding 버그가 생긴다). 활동이 생기면 lastActiveDate 가
     * 갱신되므로 유예기간도 자연히 리셋된다.
     * 정책(유예일수/1회 차감량/on-off)은 애플리케이션 설정에서 조정 — 이 메서드는 메커니즘만 제공.
     */
    public void decay(LocalDate today, int graceDays, int pointsPerDay) {
        if (today.equals(lastDecayedDate)) return; // 오늘 이미 처리됨

        LocalDate lastActive = lastActiveDate();
        if (lastActive == null) return; // 한 번도 안 자란 캐릭터는 깎을 게 없다

        LocalDate graceEnd = lastActive.plusDays(graceDays);
        if (!today.isAfter(graceEnd)) {
            lastDecayedDate = today; // 아직 유예기간 — 처리한 것으로만 표시하고 차감 없음
            return;
        }

        // 마지막 차감 지점(유예 종료일 이후로 한정) 부터 오늘까지의 "새" 유휴일수만 차감
        LocalDate decayFrom = (lastDecayedDate != null && lastDecayedDate.isAfter(graceEnd))
                ? lastDecayedDate : graceEnd;
        long idleDays = java.time.temporal.ChronoUnit.DAYS.between(decayFrom, today);
        if (idleDays > 0) {
            growthPoint = Math.max(0, growthPoint - (int) (idleDays * pointsPerDay));
        }
        lastDecayedDate = today;
    }

    @FunctionalInterface
    private interface GrowthStateSetter {
        void apply(LocalDate date, boolean bonusGranted);
    }
}
