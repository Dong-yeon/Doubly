package com.fitto.body.repository;

import com.fitto.body.domain.BodyMetric;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BodyMetricRepository extends JpaRepository<BodyMetric, Long> {

    /** 그래프용 — 오래된 것부터(시간순) */
    List<BodyMetric> findByUserIdOrderByMeasuredDateAscIdAsc(Long userId);

    Optional<BodyMetric> findByIdAndUserId(Long id, Long userId);
}
