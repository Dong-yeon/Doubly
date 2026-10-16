package com.fitto.diet.dto;

/** 단식 연동 설정 — 비운 값은 바꾸지 않는다. */
public record FastingSettingsRequest(Boolean autoEnd, Boolean offerDinner) {
}
