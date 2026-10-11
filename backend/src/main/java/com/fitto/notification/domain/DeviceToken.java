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

    /**
     * 이 기기에 앱이 만든 안드로이드 알림 채널 세트의 버전(V134). null 이면 채널을 만들기 전 버전의 앱이라
     * channelId 를 싣지 않는다({@code ExpoPushNotificationService#channelIdFor}).
     */
    @Column(name = "channels_version")
    private Integer channelsVersion;

    @Builder
    private DeviceToken(Long userId, String token, String platform, Integer channelsVersion) {
        this.userId = userId;
        this.token = token;
        this.platform = platform;
        this.channelsVersion = channelsVersion;
        this.lastRegisteredAt = LocalDateTime.now();
    }

    /**
     * 같은 기기의 재등록 — 다른 계정으로 로그인했으면 주인이 바뀐다.
     *
     * <p>채널 버전은 <b>마지막 등록 값으로 덮는다</b>(안 보냈으면 null). 업데이트를 되돌려 채널을 모르는 JS 가
     * 다시 돌면 그 앱이 말한 대로 "채널 없음"으로 돌아가는 게 안전하다 — 대체 채널로라도 알림은 온다.
     */
    public void reRegister(Long userId, String platform, Integer channelsVersion) {
        this.userId = userId;
        this.platform = platform;
        this.channelsVersion = channelsVersion;
        this.lastRegisteredAt = LocalDateTime.now();
    }
}
