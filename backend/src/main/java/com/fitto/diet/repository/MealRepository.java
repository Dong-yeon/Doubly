package com.fitto.diet.repository;

import com.fitto.diet.domain.Meal;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface MealRepository extends JpaRepository<Meal, Long> {

    List<Meal> findByUserIdAndMealDateOrderByIdAsc(Long userId, LocalDate mealDate);

    boolean existsByUserIdAndMealDate(Long userId, LocalDate mealDate);

    /** 특정 기간의 기록 — 통계(끼니 완료/칼로리 집계)용. */
    List<Meal> findByUserIdAndMealDateBetween(Long userId, LocalDate start, LocalDate end);

    /** 히스토리 — 커서(id) 기반 페이징. cursor 가 null 이면 최신부터. */
    @Query("""
            select m from Meal m
            where m.userId = :userId and (cast(:cursor as Long) is null or m.id < :cursor)
            order by m.id desc
            """)
    List<Meal> findHistory(@Param("userId") Long userId,
                           @Param("cursor") Long cursor,
                           Pageable pageable);

    /** 캘린더 — 해당 기간 식단을 기록한 날짜(중복 제거). */
    @Query("""
            select distinct m.mealDate from Meal m
            where m.userId = :userId and m.mealDate between :start and :end
            order by m.mealDate
            """)
    List<LocalDate> findMealDates(@Param("userId") Long userId,
                                  @Param("start") LocalDate start,
                                  @Param("end") LocalDate end);

    /** 전체 기록한 날 수(중복 제거). */
    @Query("select count(distinct m.mealDate) from Meal m where m.userId = :userId")
    long countDistinctMealDates(@Param("userId") Long userId);

    /**
     * 커플 피드 타임라인 — 두 사람의 기록 중 커서 (createdAt, id) 이전, 최신순.
     * cursorAt 이 null 이면 첫 페이지(전체 조회)다.
     */
    @Query("""
            select m from Meal m
            where m.userId in :userIds
              and (cast(:cursorAt as LocalDateTime) is null
                   or m.createdAt < :cursorAt
                   or (m.createdAt = :cursorAt and m.id < :cursorId))
            order by m.createdAt desc, m.id desc
            """)
    List<Meal> findRecentForFeed(@Param("userIds") List<Long> userIds,
                                 @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                 @Param("cursorId") Long cursorId,
                                 Pageable pageable);

    /** 회원 탈퇴 시 본인 식단 기록 삭제. */
    @Modifying
    @Query("delete from Meal m where m.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
