package com.fitto.workout.repository;

import com.fitto.workout.domain.WorkoutProgram;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkoutProgramRepository extends JpaRepository<WorkoutProgram, Long> {

    List<WorkoutProgram> findByUserIdOrderByIdDesc(Long userId);

    Optional<WorkoutProgram> findByIdAndUserId(Long id, Long userId);
}
