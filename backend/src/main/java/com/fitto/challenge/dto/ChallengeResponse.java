package com.fitto.challenge.dto;

import com.fitto.challenge.domain.ChallengeType;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 챌린지 응답 — 내/상대 점수와 진행 상태 포함.
 *
 * <p>{@code leader} 는 <b>지금 이 순간</b>의 우세(실시간 집계), {@code result} 는
 * 종료 후 <b>확정된</b> 승패다({@code settled} 가 true 일 때만 의미가 있다).
 * 둘을 나눈 이유: 기간이 끝난 뒤 소급 입력이 들어와도 이미 발표된 결과는 바뀌지 않아야
 * 하는데, leader 만 있으면 알림으로 "이겼다"고 알린 대결이 화면에서 뒤집힌다.
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
        /** 종료 판정이 끝났는지 — ChallengeSettleNotifier 가 매일 아침 확정한다 */
        boolean settled,
        /** 확정된 승패: ME|PARTNER|TIE. 아직 판정 전이면 null */
        String result,
        LocalDateTime createdAt
) {
}
