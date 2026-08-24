package com.fitto.content.repository;

import com.fitto.content.domain.Content;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ContentRepository extends JpaRepository<Content, Long> {

    List<Content> findByCoupleIdOrderByIdDesc(Long coupleId);

    /** 커플 콘텐츠 개수 — 플랜 상한 판정 */
    long countByCoupleId(Long coupleId);
}
