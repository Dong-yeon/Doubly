package com.fitto.auth.dto;

import com.fitto.user.domain.User;

import java.time.LocalDate;

/**
 * 남에게 보여 주는 사용자 응답 — 커플 상대({@code RelationResponse.partner}), 채팅방 상대
 * ({@code ChatRoomResponse.partner}), 트레이너의 회원 목록({@code MemberSummary.member}).
 *
 * <p>{@link UserResponse} 는 <b>본인용</b>이다 — 이메일·생년월일·성별·키·알림 설정까지 실려 있어,
 * 그대로 내리면 화면에 안 그려도 API 로는 상대의 개인정보가 보인다(LOVEBODY_REVIEW_2026-10-02 §3 A-4).
 * 여기에는 앱이 실제로 읽는 필드만 둔다. 필드 이름은 UserResponse 와 같아서 옛 빌드도 그대로 읽는다.
 * 필드를 늘릴 때는 "상대가 이 값을 봐도 되는가"부터 묻는다 — 체중 추세 공개도 이 경계를 지난다.
 */
public record PartnerUserResponse(
        Long id,
        String name,
        String profileImageUrl,
        /** 탈퇴 삭제 예정일(KST) — 상대 홈이 "○월 ○일에 함께한 기록이 삭제돼요" 배너를 띄운다. */
        LocalDate withdrawalScheduledDate
) {
    public static PartnerUserResponse from(User user) {
        return new PartnerUserResponse(
                user.getId(),
                user.getName(),
                user.getProfileImageUrl(),
                user.withdrawalScheduledDate());
    }
}
