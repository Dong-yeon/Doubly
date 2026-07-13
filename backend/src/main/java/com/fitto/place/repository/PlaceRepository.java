package com.fitto.place.repository;

import com.fitto.place.domain.Place;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlaceRepository extends JpaRepository<Place, Long> {

    List<Place> findByCoupleIdOrderByIdDesc(Long coupleId);

    List<Place> findByTripIdOrderByIdDesc(Long tripId);

    long countByTripId(Long tripId);
}
