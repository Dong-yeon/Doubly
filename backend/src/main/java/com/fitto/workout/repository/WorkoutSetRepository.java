package com.fitto.workout.repository;

import com.fitto.workout.domain.WorkoutSet;
import com.fitto.workout.dto.ExerciseBest;
import com.fitto.workout.dto.ExercisePersonalBest;
import com.fitto.workout.dto.MuscleLastTrained;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 운동 세트 조회 — {@link com.fitto.workout.domain.Workout} 애그리거트에 속하지만
 * (저장은 {@code Workout.addSet} 을 통해서만) PR 판정처럼 종목을 가로지르는 조회는
 * 별도 리포지토리로 뺀다. {@code ChatMessageReactionRepository} 와 같은 이유.
 */
public interface WorkoutSetRepository extends JpaRepository<WorkoutSet, Long> {

    /**
     * 지금 저장한 운동을 <b>제외한</b>, 같은 사용자의 종목별 최고 무게(kg).
     * PR(자기 최고 기록) 판정의 기준값 — 이 운동을 저장하기 전까지의 기록만 본다.
     * 무게가 없는 세트(유산소·맨몸 운동)는 애초에 비교 대상이 아니므로 걸러낸다.
     */
    @Query("""
            select s.exerciseName as exerciseName, max(s.weightKg) as maxWeightKg
            from WorkoutSet s
            where s.workout.userId = :userId
              and s.exerciseName in :exerciseNames
              and s.workout.id <> :excludeWorkoutId
              and s.weightKg is not null
            group by s.exerciseName
            """)
    List<ExerciseBest> findPreviousBestWeights(@Param("userId") Long userId,
                                                @Param("exerciseNames") List<String> exerciseNames,
                                                @Param("excludeWorkoutId") Long excludeWorkoutId);

    /**
     * 종목별 <b>개인 최고 기록</b> — 세트별 실제 입력(entries)이 기준이다.
     *
     * <p>위 {@code findPreviousBestWeights} 와 달리 요약 필드가 아니라 entries 를 본다.
     * 요약 weightKg 는 마지막 세트 값이라 백오프 세트에서 최고 무게를 놓치기 때문이다.
     * 세션 화면이 "지금 이 세트가 신기록인가"를 즉시 판정하는 데 쓴다.
     *
     * <p>e1RM 은 Epley(w × (1 + reps/30))를 그대로 SQL 산술로 쓴다 — 표준 사칙연산이라
     * PostgreSQL·H2 양쪽에서 같게 동작한다(CLAUDE.md 의 DB 전용 문법 금지 규칙 대상 아님).
     */
    @Query("""
            select s.exerciseName as exerciseName,
                   max(e.weightKg) as maxWeightKg,
                   max(e.weightKg * (1 + e.reps / 30.0)) as maxE1rmKg
            from WorkoutSet s join s.entries e
            where s.workout.userId = :userId
              and s.exerciseName in :exerciseNames
              and e.completed = true
              and e.weightKg is not null
              and e.reps is not null
            group by s.exerciseName
            """)
    List<ExercisePersonalBest> findPersonalBests(@Param("userId") Long userId,
                                                 @Param("exerciseNames") List<String> exerciseNames);

    /** 특정 종목을 이 사용자가 가장 최근에 수행한 기록 — 입력 프리필(④)용. */
    @Query("""
            select s from WorkoutSet s
            where s.workout.userId = :userId and s.exerciseName = :exerciseName
            order by s.workout.workoutDate desc, s.workout.id desc, s.id desc
            """)
    List<WorkoutSet> findRecentByExerciseName(@Param("userId") Long userId,
                                              @Param("exerciseName") String exerciseName,
                                              Pageable pageable);

    /**
     * 부위별 마지막 수행 날짜 — 근육 회복 계산(MuscleRecoveryService)의 원본 데이터.
     * workoutDate(사용자가 실제로 운동한 날) 기준이다 — createdAt(입력한 시각)을 쓰면
     * 소급 기록(어제 운동을 오늘 입력) 시 회복률이 실제보다 낮게(방금 훈련한 것처럼) 나온다.
     */
    @Query("""
            select s.muscleGroup as muscleGroup, max(s.workout.workoutDate) as lastTrainedOn
            from WorkoutSet s
            where s.workout.userId = :userId and s.muscleGroup is not null
            group by s.muscleGroup
            """)
    List<MuscleLastTrained> findLastTrainedByMuscleGroup(@Param("userId") Long userId);
}
