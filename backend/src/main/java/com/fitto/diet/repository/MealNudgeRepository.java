package com.fitto.diet.repository;

import com.fitto.diet.domain.MealNudge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;

public interface MealNudgeRepository extends JpaRepository<MealNudge, Long> {

    boolean existsBySenderIdAndNudgeDate(Long senderId, LocalDate nudgeDate);
}
