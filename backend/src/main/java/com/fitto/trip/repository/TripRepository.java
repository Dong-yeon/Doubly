package com.fitto.trip.repository;

import com.fitto.trip.domain.Trip;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TripRepository extends JpaRepository<Trip, Long> {

    List<Trip> findByCoupleIdOrderByStartDateDescIdDesc(Long coupleId);
}
