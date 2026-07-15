package com.fitto.trip.repository;

import com.fitto.trip.domain.TripExpense;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TripExpenseRepository extends JpaRepository<TripExpense, Long> {

    /** 여행의 경비 — 최근 등록순 */
    List<TripExpense> findByTripIdOrderByCreatedAtDescIdDesc(Long tripId);
}
