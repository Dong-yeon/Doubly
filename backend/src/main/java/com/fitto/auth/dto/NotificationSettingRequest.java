package com.fitto.auth.dto;

/**
 * 푸시 알림 수신 설정 — SET-01. 마스터 스위치(enabled) + 카테고리별 설정 4개, 전부 선택 항목이다.
 * null 로 보낸 필드는 건드리지 않는다(부분 수정) — 화면에서 토글 하나만 바꿔도 그 필드만 보내면 된다.
 */
public record NotificationSettingRequest(
        Boolean enabled,
        Boolean notifyChat,
        Boolean notifyAnniversary,
        Boolean notifyPartnerActivity,
        Boolean notifyReminder
) {
}
