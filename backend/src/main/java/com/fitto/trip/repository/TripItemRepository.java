package com.fitto.trip.repository;

import com.fitto.trip.domain.TripItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TripItemRepository extends JpaRepository<TripItem, Long> {

    /** 일정 항목 — Day → 하루 안 순서 → id 순 */
    List<TripItem> findByTripIdOrderByDayNoAscSortOrderAscIdAsc(Long tripId);

    /** 특정 Day 의 다음 정렬 순서 계산용 */
    List<TripItem> findByTripIdAndDayNo(Long tripId, int dayNo);
}
