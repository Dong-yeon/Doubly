package com.fitto.body.repository;

import com.fitto.body.domain.BodyMetric;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BodyMetricRepository extends JpaRepository<BodyMetric, Long> {

    /** 그래프용 — 오래된 것부터(시간순) */
    List<BodyMetric> findByUserIdOrderByMeasuredDateAscIdAsc(Long userId);

    Optional<BodyMetric> findByIdAndUserId(Long id, Long userId);

    /** 가장 최근 체중 — 에너지 밸런스(기초대사량) 계산용 */
    Optional<BodyMetric> findTopByUserIdOrderByMeasuredDateDescIdDesc(Long userId);
}
