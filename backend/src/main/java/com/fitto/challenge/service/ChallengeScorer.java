package com.fitto.challenge.service;

import com.fitto.challenge.domain.ChallengeType;
import com.fitto.challenge.domain.CoupleChallenge;
import com.fitto.diet.repository.MealRepository;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.stereotype.Component;

/**
 * 대결 점수 집계 — 기간 내 <b>기록일 수</b>(중복 제거).
 *
 * <p>조회 화면({@link CoupleChallengeService})과 종료 판정({@link ChallengeSettleNotifier})이
 * 같은 규칙으로 세야 한다. 각자 구현하면 "화면에서는 이겼는데 결과 푸시는 졌다고 온다" 가
 * 된다 — 눈에 띄기까지 오래 걸리고, 한 번 겪으면 신뢰가 회복되지 않는 종류의 어긋남이다.
 */
@Component
public class ChallengeScorer {

    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;

    public ChallengeScorer(WorkoutRepository workoutRepository, MealRepository mealRepository) {
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
    }

    public int score(CoupleChallenge challenge, Long userId) {
        if (userId == null) return 0;
        ChallengeType type = challenge.getType();
        return type == ChallengeType.WORKOUT
                ? workoutRepository.findWorkoutDates(userId, challenge.getStartDate(), challenge.getEndDate()).size()
                : mealRepository.findMealDates(userId, challenge.getStartDate(), challenge.getEndDate()).size();
    }
}
