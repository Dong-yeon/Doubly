package com.fitto.auth.dto;

import com.fitto.common.policy.PolicyVersion;
import com.fitto.user.domain.Gender;
import com.fitto.user.domain.Role;
import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;

import java.time.LocalDate;

/** 사용자 응답 — 설계서 5.2 */
public record UserResponse(
        Long id,
        String email,
        String name,
        Role role,
        LocalDate birthDate,
        Gender gender,
        String profileImageUrl,
        SocialType socialType,
        /** 마케팅 수신 동의 여부 — 설정 화면에서 철회할 수 있어야 한다(AUTH-09) */
        boolean marketingConsent,
        /** 푸시 알림 수신 여부 (SET-01) */
        boolean notificationsEnabled,
        /**
         * 필수 약관 재동의 필요 여부 (AUTH-09) — 약관이 개정됐거나(버전 불일치)
         * 동의 이력이 없는 기존 가입자면 true. 앱은 이 값이 true 인 동안 재동의 게이트를 띄운다.
         */
        boolean requiresConsent
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole(),
                user.getBirthDate(),
                user.getGender(),
                user.getProfileImageUrl(),
                user.getSocialType(),
                user.hasMarketingConsent(),
                user.isNotificationsEnabled(),
                !user.hasAgreedTo(PolicyVersion.TERMS, PolicyVersion.PRIVACY));
    }
}
