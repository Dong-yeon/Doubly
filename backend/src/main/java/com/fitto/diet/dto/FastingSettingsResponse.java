package com.fitto.diet.dto;

/**
 * 단식 연동 설정. autoEnd — 식사를 기록하면 진행 중인 단식을 자동으로 끝낸다.
 * offerDinner — 저녁을 기록하면 "단식 시작할까요?"를 묻는다(최근 30일 안에 단식해 본 사람에게만).
 */
public record FastingSettingsResponse(boolean autoEnd, boolean offerDinner) {
}
