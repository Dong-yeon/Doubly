package com.fitto.workout.repository;

import com.fitto.workout.domain.WorkoutSet;
import com.fitto.workout.dto.ExerciseBest;
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

    /** 특정 종목을 이 사용자가 가장 최근에 수행한 기록 — 입력 프리필(④)용. */
    @Query("""
            select s from WorkoutSet s
            where s.workout.userId = :userId and s.exerciseName = :exerciseName
            order by s.workout.workoutDate desc, s.workout.id desc, s.id desc
            """)
    List<WorkoutSet> findRecentByExerciseName(@Param("userId") Long userId,
                                              @Param("exerciseName") String exerciseName,
                                              Pageable pageable);

    /** 부위별 마지막 수행 시각 — 근육 회복 계산(MuscleRecoveryService)의 원본 데이터. */
    @Query("""
            select s.muscleGroup as muscleGroup, max(s.workout.createdAt) as lastTrainedAt
            from WorkoutSet s
            where s.workout.userId = :userId and s.muscleGroup is not null
            group by s.muscleGroup
            """)
    List<MuscleLastTrained> findLastTrainedByMuscleGroup(@Param("userId") Long userId);
}
