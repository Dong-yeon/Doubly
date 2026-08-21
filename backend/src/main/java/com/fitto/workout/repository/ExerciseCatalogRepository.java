package com.fitto.workout.repository;

import com.fitto.workout.domain.ExerciseCatalog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ExerciseCatalogRepository extends JpaRepository<ExerciseCatalog, Long> {

    List<ExerciseCatalog> findAllByOrderByMuscleGroupAscNameAsc();

    /** 특정 자극 부위의 종목들 — 대체 종목 후보 조회. 자기 자신은 호출부에서 제외한다. */
    List<ExerciseCatalog> findByMuscleGroupOrderByName(String muscleGroup);

    /**
     * 시스템 기본 제공(created_by IS NULL) + 내가 만든 커스텀 종목만 — created_by 필터가
     * 없으면 커스텀 종목 기능이 열리는 순간 타인이 만든 종목이 전 유저에게 노출된다.
     */
    @Query("""
            select c from ExerciseCatalog c
            where c.createdBy is null or c.createdBy = :userId
            order by c.muscleGroup asc, c.name asc
            """)
    List<ExerciseCatalog> findVisibleAll(@Param("userId") Long userId);

    @Query("""
            select c from ExerciseCatalog c
            where c.muscleGroup = :muscleGroup
              and (c.createdBy is null or c.createdBy = :userId)
            order by c.name asc
            """)
    List<ExerciseCatalog> findVisibleByMuscleGroup(@Param("muscleGroup") String muscleGroup,
                                                   @Param("userId") Long userId);

    @Query("""
            select c from ExerciseCatalog c
            where c.name in :names
              and (c.createdBy is null or c.createdBy = :userId)
            """)
    List<ExerciseCatalog> findVisibleByNameIn(@Param("names") List<String> names,
                                              @Param("userId") Long userId);
}
