package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 이 사진으로 남긴 식단이 있는지 — 본문으로 받는다. 쿼리 문자열에 실으면 이미지 URL 이 접속 로그에 남는다.
 */
public record PhotoRecordLookupRequest(@NotBlank String photoUrl) {
}
