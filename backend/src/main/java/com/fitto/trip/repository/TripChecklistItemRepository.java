package com.fitto.trip.repository;

import com.fitto.trip.domain.TripChecklistItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TripChecklistItemRepository extends JpaRepository<TripChecklistItem, Long> {

    /** 체크리스트 — 정렬 순서 → id 순 */
    List<TripChecklistItem> findByTripIdOrderBySortOrderAscIdAsc(Long tripId);

    long countByTripId(Long tripId);
}
