package com.fitto.game.domain;

import com.fitto.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 생성 작업(V143 {@code spot_puzzle_jobs}). Spring 은 넣기만 하고, 집고 끝내는 것은 Python worker 다
 * ({@code worker/spot-diff/spot_worker/jobs.py} — {@code FOR UPDATE SKIP LOCKED}).
 */
@Entity
@Table(name = "spot_puzzle_jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SpotPuzzleJob extends BaseTimeEntity {

    public static final String QUEUED = "QUEUED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "puzzle_id", nullable = false)
    private Long puzzleId;

    @Column(nullable = false, length = 10)
    private String status;

    /** 후보 사진 JSON 배열 문자열 — {@code [{"type":"POST","id":1,"url":"..."}]} */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String candidates;

    @Column(nullable = false)
    private Long seed;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    @Column(length = 500)
    private String error;

    public SpotPuzzleJob(Long puzzleId, String candidates, long seed) {
        this.puzzleId = puzzleId;
        this.candidates = candidates;
        this.seed = seed;
        this.status = QUEUED;
    }
}
