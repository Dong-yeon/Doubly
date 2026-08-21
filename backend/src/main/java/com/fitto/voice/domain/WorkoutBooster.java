package com.fitto.voice.domain;

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
 * 운동 부스터 — 애인이 즉석 녹음해 보내는 <b>일회성</b> 응원.
 *
 * <p>{@link VoiceClip}(문구별 상설 클립)과 성격이 반대다. 부스터는 상대의 다음 세션이
 * 시작될 때 한 번 재생되고 소멸한다 — 운동을 시작하는 그 순간이 가장 힘든 지점이고,
 * 거기에 애인 목소리를 얹는 게 이 기능이 파는 전부다.
 *
 * <p>{@code playedAt} 이 소비 표시를 겸한다. 별도 상태 컬럼을 두면 "재생됐는데 대기 중"
 * 같은 어긋난 조합이 생긴다.
 */
@Entity
@Table(name = "workout_boosters")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutBooster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    @Column(name = "receiver_id", nullable = false)
    private Long receiverId;

    @Column(name = "audio_url", nullable = false, columnDefinition = "text")
    private String audioUrl;

    @Column(length = 100)
    private String message;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "played_at")
    private LocalDateTime playedAt;

    @Builder
    private WorkoutBooster(Long relationId, Long senderId, Long receiverId, String audioUrl, String message) {
        this.relationId = relationId;
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.audioUrl = audioUrl;
        this.message = message;
    }

    /**
     * 소비 표시 — 이미 들은 것은 다시 표시하지 않는다.
     *
     * @return 이번 호출로 소비됐으면 true (재생 완료 요청이 중복으로 들어와도 안전하다)
     */
    public boolean markPlayed(LocalDateTime at) {
        if (playedAt != null) return false;
        this.playedAt = at;
        return true;
    }

    public boolean isPlayed() {
        return playedAt != null;
    }
}
