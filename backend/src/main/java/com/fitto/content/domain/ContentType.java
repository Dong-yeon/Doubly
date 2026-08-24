package com.fitto.content.domain;

/**
 * 콘텐츠 종류 — 장소(Place)에 넣지 않기로 한 것들(영화·공연·드라마) 전용.
 * 좌표·주소가 없는 게 정상이라 Place 와 도메인을 분리했다(2026-08-24 결정).
 */
public enum ContentType {
    MOVIE,
    PERFORMANCE,
    DRAMA
}
