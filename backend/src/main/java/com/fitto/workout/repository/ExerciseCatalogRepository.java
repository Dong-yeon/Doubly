package com.fitto.workout.repository;

import com.fitto.workout.domain.ExerciseCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExerciseCatalogRepository extends JpaRepository<ExerciseCatalog, Long> {

    List<ExerciseCatalog> findAllByOrderByMuscleGroupAscNameAsc();

    /** 특정 자극 부위의 종목들 — 대체 종목 후보 조회. 자기 자신은 호출부에서 제외한다. */
    List<ExerciseCatalog> findByMuscleGroupOrderByName(String muscleGroup);
}
