package com.fitto.streak.service;

import com.fitto.diet.repository.MealRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.streak.domain.Streak;
import com.fitto.streak.domain.StreakType;
import com.fitto.streak.dto.StreakResponse;
import com.fitto.streak.repository.StreakRepository;
import com.fitto.workout.repository.WorkoutRepository;
import com.fitto.common.time.KstClock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 스트릭 서비스 — 설계서 3.5 (GAME-01 개인 / GAME-02 커플).
 * 운동 저장 시 증감하고, 조회 시 끊김 여부를 반영한다.
 */
@Service
@Transactional(readOnly = true)
public class StreakService {

    private final StreakRepository streakRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;
    private final StreakMilestoneNotifier milestoneNotifier;

    public StreakService(StreakRepository streakRepository,
                         RelationRepository relationRepository,
                         WorkoutRepository workoutRepository,
                         MealRepository mealRepository,
                         StreakMilestoneNotifier milestoneNotifier) {
        this.streakRepository = streakRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
        this.milestoneNotifier = milestoneNotifier;
    }

    /**
     * 운동 저장 시 호출 — 개인/커플 스트릭 갱신.
     * 별도 트랜잭션(REQUIRES_NEW): 유니크 경합으로 실패해도 운동 저장은 보존된다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateOnWorkout(Long userId, LocalDate date) {
        // 개인 스트릭
        Streak personal = streakRepository.findByUserIdAndStreakType(userId, StreakType.PERSONAL)
                .orElseGet(() -> Streak.personal(userId));
        int personalBefore = personal.getCurrentCount();
        personal.applyWorkout(date);
        streakRepository.save(personal);

        Optional<Relation> couple = activeCouple(userId);
        celebratePersonal(userId, couple, StreakType.PERSONAL, personalBefore, personal.getCurrentCount());

        // 커플 스트릭 — 둘 다 해당 날짜에 운동했을 때만 카운트
        couple.ifPresent(c -> {
            Long partnerId = c.partnerOf(userId);
            if (partnerId != null && workoutRepository.existsByUserIdAndWorkoutDate(partnerId, date)) {
                Streak coupleStreak = streakRepository
                        .findByRelationIdAndStreakType(c.getId(), StreakType.COUPLE)
                        .orElseGet(() -> Streak.couple(c.getId()));
                int before = coupleStreak.getCurrentCount();
                coupleStreak.applyWorkout(date);
                streakRepository.save(coupleStreak);
                celebrateCouple(userId, c, StreakType.COUPLE, before, coupleStreak.getCurrentCount());
            }
        });
    }

    /**
     * 식단 저장 시 호출 — 개인/커플 식단 스트릭 갱신.
     * 별도 트랜잭션(REQUIRES_NEW): 유니크 경합으로 실패해도 식단 저장은 보존된다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateOnMeal(Long userId, LocalDate date) {
        Streak personal = streakRepository.findByUserIdAndStreakType(userId, StreakType.PERSONAL_MEAL)
                .orElseGet(() -> Streak.personalMeal(userId));
        int personalBefore = personal.getCurrentCount();
        personal.applyWorkout(date);
        streakRepository.save(personal);

        Optional<Relation> couple = activeCouple(userId);
        celebratePersonal(userId, couple, StreakType.PERSONAL_MEAL, personalBefore, personal.getCurrentCount());

        // 커플 식단 스트릭 — 둘 다 해당 날짜에 기록했을 때만 카운트
        couple.ifPresent(c -> {
            Long partnerId = c.partnerOf(userId);
            if (partnerId != null && mealRepository.existsByUserIdAndMealDate(partnerId, date)) {
                Streak coupleStreak = streakRepository
                        .findByRelationIdAndStreakType(c.getId(), StreakType.COUPLE_MEAL)
                        .orElseGet(() -> Streak.coupleMeal(c.getId()));
                int before = coupleStreak.getCurrentCount();
                coupleStreak.applyWorkout(date);
                streakRepository.save(coupleStreak);
                celebrateCouple(userId, c, StreakType.COUPLE_MEAL, before, coupleStreak.getCurrentCount());
            }
        });
    }

    /*
     * 마일스톤 축하 — "올라갔을 때만" 판정한다.
     *
     * applyWorkout 은 이어지면 +1, 끊겼으면 1 로 리셋, 중복 저장이면 그대로다.
     * before < after 조건이 없으면 같은 날 여러 번 저장할 때마다 축하가 반복된다.
     */
    private void celebratePersonal(Long userId, Optional<Relation> couple, StreakType type,
                                   int before, int after) {
        if (after <= before || !StreakMilestoneNotifier.isMilestone(after)) return;
        milestoneNotifier.personalReached(userId, couple.map(c -> c.partnerOf(userId)).orElse(null),
                type, after);
    }

    private void celebrateCouple(Long triggeredBy, Relation couple, StreakType type,
                                 int before, int after) {
        if (after <= before || !StreakMilestoneNotifier.isMilestone(after)) return;
        milestoneNotifier.coupleReached(triggeredBy, couple, type, after);
    }

    public StreakResponse getMyStreak(Long userId) {
        LocalDate today = KstClock.today();
        return streakRepository.findByUserIdAndStreakType(userId, StreakType.PERSONAL)
                .map(s -> StreakResponse.of(s, today))
                .orElseGet(() -> StreakResponse.empty(StreakType.PERSONAL));
    }

    /** 상대의 개인 운동 스트릭 — 홈 위젯·응원 표시용. 커플 미연결이면 빈 값. */
    public StreakResponse getPartnerStreak(Long userId) {
        LocalDate today = KstClock.today();
        return activeCouple(userId)
                .map(c -> c.partnerOf(userId))   // 상대가 아직 없으면(null) empty 로 이어진다
                .flatMap(partnerId -> streakRepository
                        .findByUserIdAndStreakType(partnerId, StreakType.PERSONAL))
                .map(s -> StreakResponse.of(s, today))
                .orElseGet(() -> StreakResponse.empty(StreakType.PERSONAL));
    }

    public StreakResponse getCoupleStreak(Long userId) {
        LocalDate today = KstClock.today();
        return activeCouple(userId)
                .flatMap(c -> streakRepository.findByRelationIdAndStreakType(c.getId(), StreakType.COUPLE))
                .map(s -> StreakResponse.of(s, today))
                .orElseGet(() -> StreakResponse.empty(StreakType.COUPLE));
    }

    public StreakResponse getMyMealStreak(Long userId) {
        LocalDate today = KstClock.today();
        return streakRepository.findByUserIdAndStreakType(userId, StreakType.PERSONAL_MEAL)
                .map(s -> StreakResponse.of(s, today))
                .orElseGet(() -> StreakResponse.empty(StreakType.PERSONAL_MEAL));
    }

    public StreakResponse getCoupleMealStreak(Long userId) {
        LocalDate today = KstClock.today();
        return activeCouple(userId)
                .flatMap(c -> streakRepository.findByRelationIdAndStreakType(c.getId(), StreakType.COUPLE_MEAL))
                .map(s -> StreakResponse.of(s, today))
                .orElseGet(() -> StreakResponse.empty(StreakType.COUPLE_MEAL));
    }

    private Optional<Relation> activeCouple(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        return couples.isEmpty() ? Optional.empty() : Optional.of(couples.get(0));
    }
}
