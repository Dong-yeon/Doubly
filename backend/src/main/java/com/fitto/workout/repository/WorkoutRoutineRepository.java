package com.fitto.workout.repository;

import com.fitto.workout.domain.WorkoutRoutine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkoutRoutineRepository extends JpaRepository<WorkoutRoutine, Long> {

    List<WorkoutRoutine> findByUserIdOrderByIdDesc(Long userId);

    /** 내 루틴 개수 — 플랜 상한 판정 */
    long countByUserId(Long userId);

    Optional<WorkoutRoutine> findByIdAndUserId(Long id, Long userId);

    /** ⑤ 검증된 분할 템플릿 목록 — 시스템 제공 루틴만. */
    List<WorkoutRoutine> findBySystemTemplateTrueOrderByIdAsc();
}
