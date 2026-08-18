package com.fitto.diet.service;

import com.fitto.body.domain.BodyMetric;
import com.fitto.body.repository.BodyMetricRepository;
import com.fitto.diet.dto.EnergyBalance;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 실시간 에너지 밸런스 — 기초대사량(BMR) + 오늘 운동 소모 칼로리 - 오늘 섭취 칼로리.
 * 목표 칼로리(NutritionGoal)를 수동 설정하지 않은 유저도 "오늘 얼마나 더 먹어도 되는지" 감을
 * 잡을 수 있게 해준다. 운동 앱이라는 특성상 "정적인 목표"보다 "오늘 움직인 만큼"이 체감이 크다.
 *
 * 필요한 프로필(키/생년월일/성별)이나 체중 기록이 없으면 계산하지 않고 null 을 돌려준다 —
 * 값을 채워 넣어 그럴듯하게 보여주는 것보다, 계산할 수 없다는 걸 명확히 하는 편이 안전하다.
 */
@Service
@Transactional(readOnly = true)
public class EnergyBalanceService {

    /**
     * 운동 강도 가정치(MET) — 웨이트 트레이닝/일반 근력 운동의 평균값(약 5~8 MET) 중간값을 썼다.
     * 종목별(예: 스쿼트 vs 플랭크) 정밀 MET 테이블은 아직 없어 모든 운동에 동일하게 적용한다.
     */
    private static final double ASSUMED_MET = 6.0;

    private final UserRepository userRepository;
    private final BodyMetricRepository bodyMetricRepository;
    private final WorkoutRepository workoutRepository;

    public EnergyBalanceService(UserRepository userRepository,
                                BodyMetricRepository bodyMetricRepository,
                                WorkoutRepository workoutRepository) {
        this.userRepository = userRepository;
        this.bodyMetricRepository = bodyMetricRepository;
        this.workoutRepository = workoutRepository;
    }

    /** consumedCalories 는 호출자(NutritionService)가 이미 계산해둔 값을 그대로 받아 중복 조회를 피한다. */
    public EnergyBalance compute(Long userId, int consumedCalories) {
        User user = userRepository.findById(userId).orElse(null);
        BigDecimal weightKg = bodyMetricRepository.findTopByUserIdOrderByMeasuredDateDescIdDesc(userId)
                .map(BodyMetric::getWeightKg)
                .orElse(null);

        Integer bmr = BmrCalculator.calc(user, weightKg);
        int exerciseCalories = weightKg != null ? todayExerciseCalories(userId, weightKg) : 0;
        Integer energyBalance = bmr != null ? bmr + exerciseCalories - consumedCalories : null;

        return new EnergyBalance(bmr, exerciseCalories, energyBalance);
    }

    /** 오늘 운동 기록의 총 시간(분)을 가정 MET 로 환산 — kcal = MET × 3.5 × 체중(kg) / 200 × 시간(분) */
    private int todayExerciseCalories(Long userId, BigDecimal weightKg) {
        List<Workout> todayWorkouts = workoutRepository.findByUserIdAndWorkoutDateOrderByIdDesc(userId, LocalDate.now());
        int totalMin = todayWorkouts.stream()
                .mapToInt(w -> w.getTotalDurationMin() != null ? w.getTotalDurationMin() : 0)
                .sum();
        if (totalMin <= 0) {
            return 0;
        }
        double kcal = ASSUMED_MET * 3.5 * weightKg.doubleValue() / 200.0 * totalMin;
        return (int) Math.round(kcal);
    }
}
