package com.fitto.workout.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 심화 통계(볼륨·1RM·부위 밸런스)의 원본 한 줄 — 완료된 세트 하나.
 *
 * <p><b>왜 SQL 에서 집계하지 않나</b>: 필요한 집계가 셋인데(주 단위 볼륨 · 종목별 최고
 * e1RM · 부위별 세트 수) 그중 주 단위 묶기가 DB 함수({@code date_trunc})를 부른다.
 * H2 와 PostgreSQL 에서 같게 동작해야 하는 제약(CLAUDE.md 4절)을 감안하면, 한 번 긁어
 * 자바에서 세 번 접는 편이 질의 세 개보다 안전하고 빠르다 — 범위가 최근 8주라
 * 헤비 유저도 수백 행이다.
 */
public interface DeepStatRow {

    LocalDate getWorkoutDate();

    String getExerciseName();

    /** 세분 부위(가슴·등·…). 카탈로그를 안 거친 수기 입력이면 null. */
    String getMuscleGroup();

    /** 큰 분류 — muscleGroup 이 없을 때의 대체값. */
    String getCategory();

    BigDecimal getWeightKg();

    Integer getReps();
}
