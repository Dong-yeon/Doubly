package com.fitto.relation.dto;

import com.fitto.relation.domain.MemberRole;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;

import java.time.LocalDateTime;
import java.util.List;

/** 가족 응답 — 멤버 목록 포함. myRole 은 조회 주체의 역할. */
public record FamilyResponse(
        Long id,
        String name,
        RelationStatus status,
        LocalDateTime connectedAt,
        MemberRole myRole,
        List<FamilyMemberResponse> members
) {
    public static FamilyResponse of(Relation relation, MemberRole myRole,
                                    List<FamilyMemberResponse> members) {
        return new FamilyResponse(
                relation.getId(),
                relation.getRelationName(),
                relation.getStatus(),
                relation.getConnectedAt(),
                myRole,
                members);
    }
}
