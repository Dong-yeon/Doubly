package com.fitto.diet.repository;

import com.fitto.diet.domain.MealReminder;
import com.fitto.diet.domain.MealType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

public interface MealReminderRepository extends JpaRepository<MealReminder, Long> {

    /** 설정 화면 — 등록해둔 것만(꺼진 끼니는 행 자체가 없다). */
    List<MealReminder> findByUserId(Long userId);

    Optional<MealReminder> findByUserIdAndMealType(Long userId, MealType mealType);

    void deleteByUserIdAndMealType(Long userId, MealType mealType);

    /** 스케줄러 — 지금 이 분(minute)에 울려야 하는 행 전체. */
    List<MealReminder> findByReminderTime(LocalTime reminderTime);

    /** 회원 탈퇴 시 정리. */
    @Modifying
    @Query("delete from MealReminder r where r.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
