package com.fitto.voice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 커플 음성 응원 클립 — 애인 목소리로 녹음한 짧은 응원 문구 하나.
 * 사용자당 문구({@link VoicePhrase})마다 최대 1개, 재녹음은 기존 것을 교체한다.
 */
@Entity
@Table(name = "voice_clips")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VoiceClip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private VoicePhrase phrase;

    @Column(name = "audio_url", nullable = false, columnDefinition = "text")
    private String audioUrl;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private VoiceClip(Long userId, VoicePhrase phrase, String audioUrl) {
        this.userId = userId;
        this.phrase = phrase;
        this.audioUrl = audioUrl;
    }

    /** 재녹음 — 같은 문구를 다시 녹음하면 기존 클립을 교체한다(누적 아님). */
    public void updateUrl(String audioUrl) {
        this.audioUrl = audioUrl;
    }
}
