package com.fitto.content.repository;

import com.fitto.content.domain.ContentRating;
import com.fitto.place.repository.LovelichelinActivityRow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ContentRatingRepository extends JpaRepository<ContentRating, Long> {

    Optional<ContentRating> findByContentIdAndUserId(Long contentId, Long userId);

    /** 한 콘텐츠의 대표 평점 전체(최대 2건 — 나/상대) */
    List<ContentRating> findByContentId(Long contentId);

    /** 목록 화면용 배치 조회 — PlaceRatingRepository.findByPlaceIdIn 과 같은 이유로 in 절 하나로 묶는다 */
    List<ContentRating> findByContentIdIn(List<Long> contentIds);

    /** 홈 왕관 — 이 커플 콘텐츠에 [from, to) 사이 매기거나 고친 대표 평점 */
    @Query("""
            select r.contentId as targetId, c.title as targetName, r.userId as userId, r.ratedAt as at, r.rating as rating
            from ContentRating r join Content c on c.id = r.contentId
            where c.coupleId = :coupleId and r.ratedAt >= :from and r.ratedAt < :to
            """)
    List<LovelichelinActivityRow> findActivityBetween(@Param("coupleId") Long coupleId,
                                                      @Param("from") LocalDateTime from,
                                                      @Param("to") LocalDateTime to);
}
