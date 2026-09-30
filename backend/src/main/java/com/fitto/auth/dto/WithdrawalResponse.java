package com.fitto.auth.dto;

import java.time.LocalDate;

/** 탈퇴 요청 응답 — 계정과 기록이 실제로 삭제될 날짜(KST). 그 전에 다시 로그인하면 취소된다. */
public record WithdrawalResponse(LocalDate scheduledDate) {
}
