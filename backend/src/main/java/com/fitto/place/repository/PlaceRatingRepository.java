package com.fitto.place.repository;

import com.fitto.place.domain.PlaceRating;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlaceRatingRepository extends JpaRepository<PlaceRating, Long> {

    Optional<PlaceRating> findByPlaceIdAndUserId(Long placeId, Long userId);

    /** 한 장소의 대표 평점 전체(최대 2건 — 나/상대) */
    List<PlaceRating> findByPlaceId(Long placeId);

    /** 목록 화면용 배치 조회 — {@link PlaceVisitRepository#summarize} 와 같은 이유로 place 별로 in 절 하나로 묶는다 */
    List<PlaceRating> findByPlaceIdIn(List<Long> placeIds);
}
