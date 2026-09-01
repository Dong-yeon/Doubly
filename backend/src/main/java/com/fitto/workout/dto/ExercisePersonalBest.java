package com.fitto.workout.dto;

import java.math.BigDecimal;

/**
 * 종목별 개인 최고 기록 — JPQL 인터페이스 프로젝션.
 *
 * <p>{@link ExerciseBest}(요약 필드 기준, 저장 시점 PR 판정용)와 달리 <b>세트별 실제
 * 입력(entries)</b>에서 뽑는다. 세션 화면이 "지금 체크한 이 세트가 신기록인가"를
 * 서버를 다시 부르지 않고 판정하도록, 세션 시작 시 한 번에 받아 간다.
 */
public interface ExercisePersonalBest {
    String getExerciseName();

    /** 지금까지 이 종목에서 든 가장 무거운 무게(kg) */
    BigDecimal getMaxWeightKg();

    /** 지금까지의 최고 추정 1RM(kg) — Epley */
    BigDecimal getMaxE1rmKg();
}
