package com.fitto.workout.repository;

import com.fitto.workout.domain.Workout;
import com.fitto.workout.dto.CategoryCount;
import com.fitto.workout.dto.DeepStatRow;
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

    /** 여행 회고(Trip Recap) — 기간 내 두 사람 합산 운동 기록 수. */
    long countByUserIdInAndWorkoutDateBetween(List<Long> userIds, LocalDate start, LocalDate end);

    /**
     * 히스토리 — 커서(id) 기반 페이징. cursor 가 null 이면 최신부터.
     *
     * <p>오늘 기록은 뺀다({@code workoutDate < :today}). 운동 홈이 오늘 기록을 "진행한
     * 운동" 섹션에 이미 따로 보여주는데, 이 쿼리가 날짜 구분 없이 전부 내려주던 바람에
     * 오늘 기록이 그 아래 히스토리 목록에도 한 번 더 나왔다(2026-09-01 분석 1-4).
     * {@link #findByUserIdAndWorkoutDateOrderByIdDesc}(findToday 가 쓴다)와 겹치지
     * 않게 딱 그 경계로 나눈다.
     */
    @Query("""
            select w from Workout w
            where w.userId = :userId and w.workoutDate < :today
              and (cast(:cursor as Long) is null or w.id < :cursor)
            order by w.id desc
            """)
    List<Workout> findHistory(@Param("userId") Long userId,
                              @Param("today") LocalDate today,
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

    /**
     * 심화 통계의 원본 — 최근 기간의 <b>완료된</b> 세트 하나하나.
     *
     * <p>요약 필드({@code WorkoutSet.weightKg}·{@code reps})가 아니라 entries 를 본다.
     * 요약은 마지막 세트 값이라 백오프 세트에서 최고 무게와 총 볼륨을 둘 다 놓친다
     * ({@code WorkoutSetRepository.findPersonalBests} 가 같은 이유로 같은 선택을 했다).
     *
     * <p>{@code completed = true} 만 센다 — 진행 중인 세션의 체크 안 된 세트가 볼륨에
     * 섞이면 오늘 숫자가 실제보다 커진다(CLAUDE.md 4절 "상태 필터링"과 같은 취지).
     */
    @Query("""
            select s.workout.workoutDate as workoutDate,
                   s.exerciseName as exerciseName,
                   s.muscleGroup as muscleGroup,
                   s.category as category,
                   e.weightKg as weightKg,
                   e.reps as reps
            from WorkoutSet s join s.entries e
            where s.workout.userId = :userId
              and s.workout.workoutDate >= :since
              and e.completed = true
            """)
    List<DeepStatRow> findDeepStatRows(@Param("userId") Long userId, @Param("since") LocalDate since);

    /** 마지막 운동 날짜 (기록 없으면 null) — 트레이너 대시보드용. */
    @Query("select max(w.workoutDate) from Workout w where w.userId = :userId")
    LocalDate findLastWorkoutDate(@Param("userId") Long userId);

    /**
     * 커플 피드 타임라인 — 두 사람의 기록 중 커서 (createdAt, id) 이전, 최신순.
     * cursorAt 이 null 이면 첫 페이지(전체 조회)다.
     */
    @Query("""
            select w from Workout w
            where w.userId in :userIds
              and (cast(:cursorAt as LocalDateTime) is null
                   or w.createdAt < :cursorAt
                   or (w.createdAt = :cursorAt and w.id < :cursorId))
            order by w.createdAt desc, w.id desc
            """)
    List<Workout> findRecentForFeed(@Param("userIds") List<Long> userIds,
                                    @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                    @Param("cursorId") Long cursorId,
                                    Pageable pageable);

    /**
     * 우리 탭(사진첩) — 인증샷이 붙은 운동만. {@link #findRecentForFeed} 와 같은 keyset 에
     * {@code image_url is not null} 만 더한다 (docs/ALBUM_TAB_IA_2026-09-14.md 5-4).
     *
     * <p><b>진행 중 상태를 걸러낼 조건이 없다</b>(CLAUDE.md 4절의 {@code status='COMPLETED'}).
     * {@code workouts} 테이블에는 status 컬럼이 없고, 끝내지 않은 운동은 행으로 저장되지 않는다
     * — 기기에만 남는 초안(프론트 {@code activeWorkoutStore})이고 저장 시점에 비로소 행이 된다.
     * 즉 이 테이블의 행은 전부 완료분이라 필터가 필요 없다. status 컬럼이 생기면 여기도 함께 고칠 것.
     */
    @Query("""
            select w from Workout w
            where w.userId in :userIds
              and w.imageUrl is not null
              and (cast(:cursorAt as LocalDateTime) is null
                   or w.createdAt < :cursorAt
                   or (w.createdAt = :cursorAt and w.id < :cursorId))
            order by w.createdAt desc, w.id desc
            """)
    List<Workout> findPhotosForFeed(@Param("userIds") List<Long> userIds,
                                    @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                    @Param("cursorId") Long cursorId,
                                    Pageable pageable);

    /** 회원 탈퇴 시 본인 운동 기록 삭제 (workout_sets 는 DB ON DELETE CASCADE). */
    @Modifying
    @Query("delete from Workout w where w.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
