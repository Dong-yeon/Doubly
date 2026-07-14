package com.fitto.diet.repository;

import com.fitto.diet.domain.NutritionGoal;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NutritionGoalRepository extends JpaRepository<NutritionGoal, Long> {
}
