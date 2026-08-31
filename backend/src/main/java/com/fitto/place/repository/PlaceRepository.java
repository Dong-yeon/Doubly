package com.fitto.place.repository;

import com.fitto.place.domain.Place;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlaceRepository extends JpaRepository<Place, Long> {

    List<Place> findByCoupleIdOrderByIdDesc(Long coupleId);

    /** 커플 맛집 핀 개수 — 플랜 상한 판정 */
    long countByCoupleId(Long coupleId);

    List<Place> findByTripIdOrderByIdDesc(Long tripId);

    long countByTripId(Long tripId);

    /**
     * 여행에 담긴 장소 중 실제로 방문 기록(PlaceVisit)이 있는 개수 — 여행 회고 카드
     * "다녀온 장소 수". 예전엔 별도 status(WISHLIST/VISITED) 필드로 판정했는데, 방문
     * 기록 없이도 수동으로 방문완료로 표시할 수 있어 실제 방문 여부와 어긋날 수 있었다
     * (docs/LOVELICHELIN_IA_SIMPLIFICATION.md) — status 를 없애면서 방문 기록 존재
     * 여부로 직접 판정하도록 바꿨다. 이쪽이 더 정확하다.
     */
    @Query("""
            select count(distinct p.id) from Place p
            where p.tripId = :tripId
              and exists (select 1 from PlaceVisit v where v.placeId = p.id)
            """)
    long countVisitedByTripId(@Param("tripId") Long tripId);
}
