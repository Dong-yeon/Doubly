package com.fitto.place.repository;

import java.time.LocalDateTime;

/**
 * 럽슐랭 활동 한 건 — 방문 기록·관람 기록·대표 평점 네 곳에서 같은 모양으로 꺼낸다(홈 왕관 신호용,
 * {@link com.fitto.place.service.LovelichelinPulseService}).
 *
 * <p>{@code at} 은 저장된 벽시계 값이다(운영은 UTC) — KST 로 바꾸는 건 서비스 몫이다.
 */
public interface LovelichelinActivityRow {
    Long getTargetId();

    String getTargetName();

    Long getUserId();

    LocalDateTime getAt();

    /** 그 활동에 남긴 별점(방문·관람 기록은 선택, 대표 평점은 필수) — 없으면 null */
    Integer getRating();
}
