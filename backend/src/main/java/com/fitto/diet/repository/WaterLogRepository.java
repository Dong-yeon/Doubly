package com.fitto.diet.repository;

import com.fitto.diet.domain.WaterLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface WaterLogRepository extends JpaRepository<WaterLog, Long> {

    Optional<WaterLog> findByUserIdAndLogDate(Long userId, LocalDate logDate);
}
