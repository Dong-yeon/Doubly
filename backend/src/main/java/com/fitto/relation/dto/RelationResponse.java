package com.fitto.relation.dto;

import com.fitto.auth.dto.PartnerUserResponse;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.user.domain.User;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 관계 응답 — 설계서 4.3.
 * partner 는 조회 주체 기준 상대방 (연결 전이면 null).
 */
public record RelationResponse(
        Long id,
        RelationType relationType,
        RelationStatus status,
        PartnerUserResponse partner,
        LocalDateTime connectedAt,
        String backgroundImageUrl,
        LocalDate anniversaryDate,
        Integer dietGoalDays
) {
    public static RelationResponse of(Relation relation, User partner) {
        return new RelationResponse(
                relation.getId(),
                relation.getRelationType(),
                relation.getStatus(),
                partner != null ? PartnerUserResponse.from(partner) : null,
                relation.getConnectedAt(),
                relation.getBackgroundImageUrl(),
                relation.getAnniversaryDate(),
                relation.getDietGoalDays());
    }
}
