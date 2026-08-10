package com.fitto.trip.repository;

import com.fitto.trip.domain.Trip;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TripRepository extends JpaRepository<Trip, Long> {

    List<Trip> findByCoupleIdOrderByStartDateDescIdDesc(Long coupleId);

    /** 여행 모드 — 오늘이 기간 안이고 켜져 있는 여행. 겹치면 아무거나 하나(id 순). */
    Optional<Trip> findFirstByCoupleIdAndTravelModeEnabledTrueAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByIdAsc(
            Long coupleId, LocalDate today, LocalDate sameToday);
}
