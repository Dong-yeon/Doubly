package com.fitto.workout.repository;

import com.fitto.workout.domain.Workout;
import com.fitto.workout.dto.CategoryCount;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface WorkoutRepository extends JpaRepository<Workout, Long> {

    List<Workout> findByUserIdAndWorkoutDateOrderByIdDesc(Long userId, LocalDate workoutDate);

    boolean existsByUserIdAndWorkoutDate(Long userId, LocalDate workoutDate);

    /** 히스토리 — 커서(id) 기반 페이징. cursor 가 null 이면 최신부터. */
    @Query("""
            select w from Workout w
            where w.userId = :userId and (:cursor is null or w.id < :cursor)
            order by w.id desc
            """)
    List<Workout> findHistory(@Param("userId") Long userId,
                              @Param("cursor") Long cursor,
                              Pageable pageable);

    /** 캘린더 — 해당 기간 운동한 날짜(중복 제거). */
    @Query("""
            select distinct w.workoutDate from Workout w
            where w.userId = :userId and w.workoutDate between :start and :end
            order by w.workoutDate
            """)
    List<LocalDate> findWorkoutDates(@Param("userId") Long userId,
                                     @Param("start") LocalDate start,
                                     @Param("end") LocalDate end);

    /** 전체 운동한 날 수(중복 제거). */
    @Query("select count(distinct w.workoutDate) from Workout w where w.userId = :userId")
    long countDistinctWorkoutDates(@Param("userId") Long userId);

    /** 최근 기간 부위(카테고리)별 세트 수. */
    @Query("""
            select s.category as category, count(s) as count
            from WorkoutSet s
            where s.workout.userId = :userId and s.workout.workoutDate >= :since
              and s.category is not null
            group by s.category
            order by count(s) desc
            """)
    List<CategoryCount> categoryBreakdown(@Param("userId") Long userId,
                                          @Param("since") LocalDate since);

    /** 마지막 운동 날짜 (기록 없으면 null) — 트레이너 대시보드용. */
    @Query("select max(w.workoutDate) from Workout w where w.userId = :userId")
    LocalDate findLastWorkoutDate(@Param("userId") Long userId);

    /** 커플 피드 타임라인 — 두 사람의 기록 중 커서(createdAt) 이전, 최신순. */
    @Query("""
            select w from Workout w
            where w.userId in :userIds and w.createdAt < :cursor
            order by w.createdAt desc
            """)
    List<Workout> findRecentForFeed(@Param("userIds") List<Long> userIds,
                                    @Param("cursor") java.time.LocalDateTime cursor,
                                    Pageable pageable);

    /** 회원 탈퇴 시 본인 운동 기록 삭제 (workout_sets 는 DB ON DELETE CASCADE). */
    @Modifying
    @Query("delete from Workout w where w.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
