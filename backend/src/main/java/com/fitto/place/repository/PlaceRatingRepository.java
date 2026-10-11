package com.fitto.place.repository;

import com.fitto.place.domain.PlaceRating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PlaceRatingRepository extends JpaRepository<PlaceRating, Long> {

    Optional<PlaceRating> findByPlaceIdAndUserId(Long placeId, Long userId);

    /** 한 장소의 대표 평점 전체(최대 2건 — 나/상대) */
    List<PlaceRating> findByPlaceId(Long placeId);

    /** 목록 화면용 배치 조회 — {@link PlaceVisitRepository#summarize} 와 같은 이유로 place 별로 in 절 하나로 묶는다 */
    List<PlaceRating> findByPlaceIdIn(List<Long> placeIds);

    /** 홈 왕관 — 이 커플 장소에 [from, to) 사이 매기거나 고친 대표 평점 (rated_at 은 재평가 때 갱신된다) */
    @Query("""
            select r.placeId as targetId, p.name as targetName, r.userId as userId, r.ratedAt as at, r.rating as rating
            from PlaceRating r join Place p on p.id = r.placeId
            where p.coupleId = :coupleId and r.ratedAt >= :from and r.ratedAt < :to
            """)
    List<LovelichelinActivityRow> findActivityBetween(@Param("coupleId") Long coupleId,
                                                      @Param("from") LocalDateTime from,
                                                      @Param("to") LocalDateTime to);
}
