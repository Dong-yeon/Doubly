package com.fitto.workout.repository;

import com.fitto.workout.domain.WorkoutRoutine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkoutRoutineRepository extends JpaRepository<WorkoutRoutine, Long> {

    List<WorkoutRoutine> findByUserIdOrderByIdDesc(Long userId);

    /**
     * 프로그램 소속이 아닌(자유) 루틴만 — "내 루틴" 목록용. 프로그램 소속 Day 루틴은
     * 프로그램 카드 하나로 묶여 별도로 조회되므로(WorkoutProgramRepository) 여기 안 섞는다.
     */
    List<WorkoutRoutine> findByUserIdAndProgramIsNullOrderByIdDesc(Long userId);

    /** 내 루틴 개수 — 플랜 상한 판정. 프로그램 소속 Day 도 각자 루틴 한 개로 세어 한도에 포함한다. */
    long countByUserId(Long userId);

    Optional<WorkoutRoutine> findByIdAndUserId(Long id, Long userId);

    /** ⑤ 검증된 분할 템플릿 목록 — 시스템 제공 루틴만. */
    List<WorkoutRoutine> findBySystemTemplateTrueOrderByIdAsc();
}
