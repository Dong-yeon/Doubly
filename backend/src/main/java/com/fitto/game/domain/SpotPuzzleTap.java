package com.fitto.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/** 탭 한 번(V143 {@code spot_puzzle_taps}) — 판정 결과를 남겨 같은 {@code clientTapId} 재전송에 그대로 돌려준다 */
@Entity
@Table(name = "spot_puzzle_taps")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SpotPuzzleTap {

    /** 새로 찾음 */
    public static final String HIT = "HIT";
    /** 이미 찾은 곳 — 오답으로 세지 않는다 */
    public static final String REPEAT = "REPEAT";
    public static final String MISS = "MISS";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "play_id", nullable = false)
    private Long playId;

    @Column(name = "client_tap_id", nullable = false, length = 64)
    private String clientTapId;

    @Column(nullable = false)
    private double x;

    @Column(nullable = false)
    private double y;

    @Column(nullable = false, length = 10)
    private String result;

    @Column(name = "hit_id")
    private Integer hitId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public SpotPuzzleTap(Long playId, String clientTapId, double x, double y, String result, Integer hitId) {
        this.playId = playId;
        this.clientTapId = clientTapId;
        this.x = x;
        this.y = y;
        this.result = result;
        this.hitId = hitId;
    }
}
