package com.fitto.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 비밀번호 재설정 인증코드 — AUTH-07.
 * 코드 원문은 보관하지 않고 BCrypt 해시만 저장한다(DB 유출 시 코드 복원 불가).
 * password_reset_tokens 에는 created_at 만 있으므로 BaseTimeEntity 를 상속하지 않는다.
 */
@Entity
@Table(name = "password_reset_tokens")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PasswordResetToken {

    /** 검증 실패 허용 횟수 — 초과 시 코드 폐기(6자리 무차별 대입 차단) */
    public static final int MAX_ATTEMPTS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "code_hash", nullable = false, length = 100)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    private int attempts;

    /** 사용 완료 시각 — NULL 이면 미사용(1회용 보장) */
    @Column(name = "used_at")
    private LocalDateTime usedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private PasswordResetToken(Long userId, String codeHash, LocalDateTime expiresAt) {
        this.userId = userId;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
        this.attempts = 0;
    }

    public boolean isExpired() {
        return expiresAt.isBefore(LocalDateTime.now());
    }

    public boolean isUsed() {
        return usedAt != null;
    }

    public boolean isAttemptsExceeded() {
        return attempts >= MAX_ATTEMPTS;
    }

    /** 코드 검증에 쓸 수 있는 상태인지 — 미사용 + 미만료 + 시도횟수 여유. */
    public boolean isUsable() {
        return !isUsed() && !isExpired() && !isAttemptsExceeded();
    }

    public void recordFailedAttempt() {
        this.attempts++;
    }

    /** 사용 완료 처리 — 같은 코드로 두 번 재설정할 수 없게 한다. */
    public void markUsed() {
        this.usedAt = LocalDateTime.now();
    }

    /**
     * 새 코드 발급 시 기존 코드를 즉시 무효화한다.
     * 사용 처리와 구분되지 않아도 무방하다 — 어느 쪽이든 재사용 불가가 목적이다.
     */
    public void invalidate() {
        if (this.usedAt == null) {
            this.usedAt = LocalDateTime.now();
        }
    }
}
