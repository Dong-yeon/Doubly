package com.fitto.place.repository;

import com.fitto.place.domain.Place;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface PlaceRepository extends JpaRepository<Place, Long> {

    List<Place> findByCoupleIdOrderByIdDesc(Long coupleId);

    /**
     * 중복 등록 방지 1순위 — 카카오 검색 결과를 그대로 저장하는 경로(식단 기록 화면 등)는
     * kakaoPlaceId 가 실려 오므로, 같은 커플 안에 이미 그 id로 등록된 장소가 있으면 그걸
     * 재사용한다. 여러 건이 있을 수는 없지만(같은 id로 두 번 만들어질 일이 없어졌으므로)
     * findFirst 로 안전하게.
     */
    Optional<Place> findFirstByCoupleIdAndKakaoPlaceId(Long coupleId, String kakaoPlaceId);

    /**
     * 중복 등록 방지 2순위 — kakaoPlaceId 가 없을 때(직접 입력, 또는 이 필드가 생기기
     * 전에 등록된 장소)의 대조용. 좌표가 있으면 이름+좌표로, 없으면 이름+주소로 맞춰본다
     * ({@link #findFirstByCoupleIdAndNameIgnoreCaseAndAddress}).
     */
    Optional<Place> findFirstByCoupleIdAndNameIgnoreCaseAndLatAndLng(Long coupleId, String name,
                                                                      BigDecimal lat, BigDecimal lng);

    Optional<Place> findFirstByCoupleIdAndNameIgnoreCaseAndAddress(Long coupleId, String name, String address);

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
