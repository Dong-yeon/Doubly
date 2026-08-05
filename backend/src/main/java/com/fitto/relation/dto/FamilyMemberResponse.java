package com.fitto.relation.dto;

import com.fitto.relation.domain.MemberRole;
import com.fitto.relation.domain.RelationMember;
import com.fitto.user.domain.User;

import java.time.LocalDateTime;

/**
 * 가족 멤버 응답.
 * 커플의 partner(UserResponse)와 달리 이메일 등 계정 정보는 내리지 않는다 —
 * 가족은 N인이라 노출 범위를 표시용 최소(이름·사진)로 좁힌다.
 */
public record FamilyMemberResponse(
        Long userId,
        String name,
        String profileImageUrl,
        MemberRole role,
        LocalDateTime joinedAt
) {
    public static FamilyMemberResponse of(RelationMember member, User user) {
        return new FamilyMemberResponse(
                member.getUserId(),
                user != null ? user.getName() : null,
                user != null ? user.getProfileImageUrl() : null,
                member.getMemberRole(),
                member.getJoinedAt());
    }
}
