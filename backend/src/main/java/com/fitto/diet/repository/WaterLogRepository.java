package com.fitto.diet.repository;

import com.fitto.diet.domain.WaterLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface WaterLogRepository extends JpaRepository<WaterLog, Long> {

    Optional<WaterLog> findByUserIdAndLogDate(Long userId, LocalDate logDate);

    /** 물·단식 리포트 — 기간 안의 날짜별 누적 */
    List<WaterLog> findByUserIdAndLogDateBetween(Long userId, LocalDate start, LocalDate end);
}
