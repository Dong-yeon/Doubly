package com.fitto.auth.dto;

import com.fitto.common.policy.PolicyVersion;
import com.fitto.user.domain.Gender;
import com.fitto.user.domain.Role;
import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;

import java.time.LocalDate;

/**
 * 사용자 응답(본인용) — 설계서 5.2.
 * 남에게 보이는 자리(커플·채팅 상대, 트레이너 회원 목록)에는 {@link PartnerUserResponse} 를 쓴다.
 */
public record UserResponse(
        Long id,
        String email,
        String name,
        Role role,
        LocalDate birthDate,
        Gender gender,
        Integer heightCm,
        String profileImageUrl,
        SocialType socialType,
        /** 마케팅 수신 동의 여부 — 설정 화면에서 철회할 수 있어야 한다(AUTH-09) */
        boolean marketingConsent,
        /** 푸시 알림 수신 여부 (SET-01) — 전체 스위치 */
        boolean notificationsEnabled,
        /* 카테고리별 수신 여부 — 전체 스위치가 꺼져 있으면 이 값들과 무관하게 발송되지 않는다 */
        boolean notifyChat,
        boolean notifyAnniversary,
        boolean notifyPartner,
        boolean notifyReminder,
        /**
         * 음식 사진 자동 분석 여부 (2026-09-09) — 켜져 있으면 사진을 붙여 저장하는 것만으로
         * 백그라운드에서 칼로리가 채워진다. 사용자의 AI 한도를 버튼 없이 소모하므로 끌 수 있다.
         */
        boolean autoAnalyzeMealPhoto,
        /**
         * 필수 약관 재동의 필요 여부 (AUTH-09) — 약관이 개정됐거나(버전 불일치)
         * 동의 이력이 없는 기존 가입자면 true. 앱은 이 값이 true 인 동안 재동의 게이트를 띄운다.
         */
        boolean requiresConsent,
        /**
         * 탈퇴 삭제 예정일(KST) — 탈퇴 유예기간 중이면 값이 있다. 상대 화면(RelationResponse.partner)이
         * 이 값으로 "○월 ○일에 함께한 기록이 삭제돼요" 배너를 띄운다
         * ({@link PartnerUserResponse} 에도 같은 이름으로 실린다).
         */
        LocalDate withdrawalScheduledDate
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole(),
                user.getBirthDate(),
                user.getGender(),
                user.getHeightCm(),
                user.getProfileImageUrl(),
                user.getSocialType(),
                user.hasMarketingConsent(),
                user.isNotificationsEnabled(),
                user.isNotifyChat(),
                user.isNotifyAnniversary(),
                user.isNotifyPartner(),
                user.isNotifyReminder(),
                user.isAutoAnalyzeMealPhoto(),
                !user.hasAgreedTo(PolicyVersion.TERMS, PolicyVersion.PRIVACY),
                user.withdrawalScheduledDate());
    }
}
