package com.fitto.user.domain;

import com.fitto.common.domain.BaseTimeEntity;
import com.fitto.common.notification.NotificationCategory;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 회원 — 설계서 5.2 users.
 */
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    /** 소셜 로그인 시 NULL */
    @Column
    private String password;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private Gender gender;

    /** 키(cm) — 실시간 에너지 밸런스(기초대사량) 계산용. 가입 시 받지 않아 NULL 허용 */
    @Column(name = "height_cm")
    private Integer heightCm;

    @Column(name = "profile_image_url", length = 500)
    private String profileImageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "social_type", length = 20)
    private SocialType socialType;

    @Column(name = "social_id")
    private String socialId;

    /* --- 약관 동의 (AUTH-09) — 여부가 아니라 시각+버전을 남겨 개정 시 재동의를 판별한다 --- */

    @Column(name = "terms_agreed_at")
    private LocalDateTime termsAgreedAt;

    @Column(name = "terms_version", length = 20)
    private String termsVersion;

    @Column(name = "privacy_agreed_at")
    private LocalDateTime privacyAgreedAt;

    @Column(name = "privacy_version", length = 20)
    private String privacyVersion;

    /** 마케팅 수신 동의(선택) — NULL 이면 미동의 또는 철회 */
    @Column(name = "marketing_agreed_at")
    private LocalDateTime marketingAgreedAt;

    /** 푸시 알림 수신 여부 (SET-01) — 끄면 모든 푸시가 발송되지 않는다(마스터 스위치) */
    @Column(name = "notifications_enabled", nullable = false)
    private boolean notificationsEnabled = true;

    /* --- 카테고리별 알림 설정 — 마스터 스위치가 켜져 있을 때만 의미가 있다 --- */

    @Column(name = "notify_chat", nullable = false)
    private boolean notifyChat = true;

    @Column(name = "notify_anniversary", nullable = false)
    private boolean notifyAnniversary = true;

    @Column(name = "notify_partner_activity", nullable = false)
    private boolean notifyPartnerActivity = true;

    @Column(name = "notify_reminder", nullable = false)
    private boolean notifyReminder = true;

    @Builder
    private User(String email, String password, String name, LocalDate birthDate, Gender gender,
                 String profileImageUrl, Role role, SocialType socialType, String socialId) {
        this.email = email;
        this.password = password;
        this.name = name;
        this.birthDate = birthDate;
        this.gender = gender;
        this.profileImageUrl = profileImageUrl;
        this.role = role != null ? role : Role.USER;
        this.socialType = socialType;
        this.socialId = socialId;
    }

    public void updateProfile(String name, String profileImageUrl) {
        if (name != null) this.name = name;
        if (profileImageUrl != null) this.profileImageUrl = profileImageUrl;
    }

    /** 신체 정보 수정 — 생년월일/성별/키(제공된 값만 반영). 에너지 밸런스 계산에 쓰인다. */
    public void updateBodyProfile(LocalDate birthDate, Gender gender, Integer heightCm) {
        if (birthDate != null) this.birthDate = birthDate;
        if (gender != null) this.gender = gender;
        if (heightCm != null) this.heightCm = heightCm;
    }

    /** 필수 약관(이용약관·개인정보) 동의 기록 — 가입 시점에 호출된다. */
    public void agreeToRequiredTerms(String termsVersion, String privacyVersion) {
        LocalDateTime now = LocalDateTime.now();
        this.termsAgreedAt = now;
        this.termsVersion = termsVersion;
        this.privacyAgreedAt = now;
        this.privacyVersion = privacyVersion;
    }

    /** 마케팅 수신 동의/철회 — 선택 항목이므로 언제든 되돌릴 수 있어야 한다. */
    public void setMarketingConsent(boolean agreed) {
        this.marketingAgreedAt = agreed ? LocalDateTime.now() : null;
    }

    public boolean hasMarketingConsent() {
        return this.marketingAgreedAt != null;
    }

    /**
     * 현재 버전의 필수 약관에 모두 동의한 상태인지.
     * 약관이 개정되면(버전 불일치) 재동의가 필요하다 — 기존 가입자는 값이 NULL 이라 false 다.
     */
    public boolean hasAgreedTo(String currentTermsVersion, String currentPrivacyVersion) {
        return currentTermsVersion.equals(this.termsVersion)
                && currentPrivacyVersion.equals(this.privacyVersion);
    }

    /** 푸시 알림 수신 설정 변경 (SET-01) — 마스터 스위치. */
    public void setNotificationsEnabled(boolean enabled) {
        this.notificationsEnabled = enabled;
    }

    /** 카테고리별 알림 설정 — 넘긴 값 중 null 이 아닌 것만 반영한다(부분 수정). */
    public void setNotifyCategories(Boolean chat, Boolean anniversary, Boolean partnerActivity, Boolean reminder) {
        if (chat != null) this.notifyChat = chat;
        if (anniversary != null) this.notifyAnniversary = anniversary;
        if (partnerActivity != null) this.notifyPartnerActivity = partnerActivity;
        if (reminder != null) this.notifyReminder = reminder;
    }

    /**
     * 이 카테고리의 알림을 받을지 최종 판정 — 마스터 스위치가 꺼져 있으면 카테고리 설정과
     * 무관하게 차단한다(V25 도입 당시 주석이 미리 정해둔 방침).
     */
    public boolean allowsCategory(NotificationCategory category) {
        if (!notificationsEnabled) return false;
        return switch (category) {
            case CHAT -> notifyChat;
            case ANNIVERSARY -> notifyAnniversary;
            case PARTNER_ACTIVITY -> notifyPartnerActivity;
            case REMINDER -> notifyReminder;
        };
    }

    /** 비밀번호 변경 — 호출 전에 반드시 인코딩된 값을 넘겨야 한다. */
    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    /** 이메일+비밀번호 로그인 계정인지 — 소셜 전용 계정은 password 가 NULL 이다. */
    public boolean hasPassword() {
        return this.password != null;
    }

    public void promoteToTrainer() {
        if (this.role == Role.USER) {
            this.role = Role.TRAINER;
        }
    }
}
