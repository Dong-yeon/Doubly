package com.fitto.feed.repository;

import com.fitto.feed.domain.FeedPostPhoto;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FeedPostPhotoRepository extends JpaRepository<FeedPostPhoto, Long> {

    /** 포스트 하나의 사진 전체 (작성 직후 응답 조립용). */
    List<FeedPostPhoto> findByPostIdOrderByOrderNoAsc(Long postId);

    /** 타임라인 배치 조회 — 페이지에 담긴 포스트 여러 건의 사진을 한 번에 가져온다(N+1 방지). */
    List<FeedPostPhoto> findByPostIdInOrderByPostIdAscOrderNoAsc(List<Long> postIds);
}
