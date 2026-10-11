package com.fitto.place.repository;

import com.fitto.place.domain.PlaceMenuPhoto;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlaceMenuPhotoRepository extends JpaRepository<PlaceMenuPhoto, Long> {

    List<PlaceMenuPhoto> findByPlaceIdOrderByIdDesc(Long placeId);

    boolean existsByPlaceIdAndImageUrl(Long placeId, String imageUrl);

    long countByPlaceId(Long placeId);
}
