package com.fitto.trainer.dto;

import com.fitto.auth.dto.UserResponse;

import java.time.LocalDate;
import java.util.List;

/** 트레이너 대시보드 — 회원 현황 요약 (설계서 4.6) */
public record TrainerDashboardResponse(
        int totalMembers,
        int completedToday,
        List<MemberSummary> members
) {
    /** 회원 1명 요약 — 오늘 운동 완료 여부 + 마지막 운동일 */
    public record MemberSummary(
            UserResponse member,
            boolean todayCompleted,
            LocalDate lastWorkoutDate
    ) {
    }
}
