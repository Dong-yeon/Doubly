package com.fitto.content.repository;

import com.fitto.content.domain.ContentRating;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ContentRatingRepository extends JpaRepository<ContentRating, Long> {

    Optional<ContentRating> findByContentIdAndUserId(Long contentId, Long userId);

    /** 한 콘텐츠의 대표 평점 전체(최대 2건 — 나/상대) */
    List<ContentRating> findByContentId(Long contentId);

    /** 목록 화면용 배치 조회 — PlaceRatingRepository.findByPlaceIdIn 과 같은 이유로 in 절 하나로 묶는다 */
    List<ContentRating> findByContentIdIn(List<Long> contentIds);
}
