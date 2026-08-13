package com.fitto.trip.repository;

import com.fitto.trip.domain.Trip;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TripRepository extends JpaRepository<Trip, Long> {

    List<Trip> findByCoupleIdOrderByStartDateDescIdDesc(Long coupleId);

    /**
     * 아직 끝나지 않은 여행 수 — 플랜 상한 판정.
     *
     * <p>전체 개수가 아니라 <b>진행 중·예정</b>만 센다. 지난 여행까지 세면 무료 사용자가
     * 추억을 지워야 새 여행을 만들 수 있게 되어, 기록 앱으로서 해서는 안 되는 압박이 된다.
     */
    long countByCoupleIdAndEndDateGreaterThanEqual(Long coupleId, java.time.LocalDate today);

    /** 여행 모드 — 오늘이 기간 안이고 켜져 있는 여행. 겹치면 아무거나 하나(id 순). */
    Optional<Trip> findFirstByCoupleIdAndTravelModeEnabledTrueAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByIdAsc(
            Long coupleId, LocalDate today, LocalDate sameToday);
}
