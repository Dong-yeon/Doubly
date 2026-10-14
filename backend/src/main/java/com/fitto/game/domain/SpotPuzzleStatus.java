package com.fitto.game.domain;

/** 틀린그림찾기 퍼즐 상태 — docs/spot-diff-design_2026-10-14.md 2절 */
public enum SpotPuzzleStatus {
    /** 작업을 넣었고 worker 가 아직 만들지 않았다 */
    PENDING,
    /** A/B 이미지와 정답이 준비됐다 — 풀 수 있다 */
    READY,
    /** 조건(공유·짧은 변 1000px·최근 30일 미사용)을 채우는 사진이 5장 미만 */
    NOT_ENOUGH_PHOTOS,
    /** 사진을 바꿔 가며 다시 해도 차이 5개를 못 만들었다(fail_reason) */
    FAILED,
    /** 48시간이 지났거나(TIME) 원본 사진이 사라졌다(PHOTO_REMOVED) */
    EXPIRED
}
