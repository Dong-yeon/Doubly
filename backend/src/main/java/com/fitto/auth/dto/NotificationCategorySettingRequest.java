package com.fitto.auth.dto;

/**
 * 카테고리별 푸시 수신 설정 — 부분 수정. 넘긴 항목만 바뀐다.
 *
 * <p>토글 하나를 만질 때마다 네 값을 모두 실어 보내면, 다른 기기에서 방금 바꾼 설정이
 * 오래된 값으로 덮어써진다. 그래서 전부 {@code Boolean}(nullable) 이다.
 */
public record NotificationCategorySettingRequest(
        Boolean chat,
        Boolean anniversary,
        Boolean partner,
        Boolean reminder
) {
}
