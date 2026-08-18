package com.fitto.workout.repository;

import com.fitto.workout.domain.ExerciseCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExerciseCatalogRepository extends JpaRepository<ExerciseCatalog, Long> {

    List<ExerciseCatalog> findAllByOrderByMuscleGroupAscNameAsc();

    /** 특정 자극 부위의 종목들 — 대체 종목 후보 조회. 자기 자신은 호출부에서 제외한다. */
    List<ExerciseCatalog> findByMuscleGroupOrderByName(String muscleGroup);

    /**
     * 이름으로 일괄 조회 — 루틴 저장 시 exerciseCatalogId 없이 이름만 들어온 종목을
     * 카탈로그와 연결하는 안전망(WorkoutRoutineService.resolveCatalogByName)에 쓴다.
     */
    List<ExerciseCatalog> findByNameIn(List<String> names);
}
