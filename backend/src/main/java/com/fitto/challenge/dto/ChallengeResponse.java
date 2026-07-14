package com.fitto.challenge.dto;

import com.fitto.challenge.domain.ChallengeType;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 챌린지 응답 — 내/상대 점수와 진행 상태 포함. leader: ME|PARTNER|TIE.
 */
public record ChallengeResponse(
        Long id,
        ChallengeType type,
        String typeLabel,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        String stake,
        int myCount,
        int partnerCount,
        String partnerName,
        boolean ended,
        String leader,
        LocalDateTime createdAt
) {
}
