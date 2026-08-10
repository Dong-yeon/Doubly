package com.fitto.workout.repository;

import com.fitto.workout.domain.WorkoutSet;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkoutSetRepository extends JpaRepository<WorkoutSet, Long> {

    /** 특정 종목을 이 사용자가 가장 최근에 수행한 기록 — 입력 프리필(④)용. */
    @Query("""
            select s from WorkoutSet s
            where s.workout.userId = :userId and s.exerciseName = :exerciseName
            order by s.workout.workoutDate desc, s.workout.id desc, s.id desc
            """)
    List<WorkoutSet> findRecentByExerciseName(@Param("userId") Long userId,
                                              @Param("exerciseName") String exerciseName,
                                              Pageable pageable);
}
