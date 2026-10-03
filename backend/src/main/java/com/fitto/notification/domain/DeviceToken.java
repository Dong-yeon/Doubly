package com.fitto.notification.domain;

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

/** 푸시 디바이스 토큰 (Expo Push) */
@Entity
@Table(name = "device_tokens")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeviceToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, unique = true)
    private String token;

    @Column(length = 20)
    private String platform;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** 마지막으로 등록된 시각(V128) — 앱이 시작할 때마다 다시 등록하므로 "아직 쓰이는 기기"의 기준이다 */
    @Column(name = "last_registered_at", nullable = false)
    private LocalDateTime lastRegisteredAt;

    @Builder
    private DeviceToken(Long userId, String token, String platform) {
        this.userId = userId;
        this.token = token;
        this.platform = platform;
        this.lastRegisteredAt = LocalDateTime.now();
    }

    /** 같은 기기의 재등록 — 다른 계정으로 로그인했으면 주인이 바뀐다 */
    public void reRegister(Long userId, String platform) {
        this.userId = userId;
        this.platform = platform;
        this.lastRegisteredAt = LocalDateTime.now();
    }
}
