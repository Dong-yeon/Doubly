package com.fitto.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 한 사람의 풀이(V143 {@code spot_puzzle_plays}). 시간은 서버가 적은 {@code started_at} → {@code finished_at} 으로만 잰다.
 * 고치는 쪽은 퍼즐 행을 잠근 {@code SpotDiffService} 뿐이다.
 */
@Entity
@Table(name = "spot_puzzle_plays")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SpotPuzzlePlay {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "puzzle_id", nullable = false)
    private Long puzzleId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(name = "found_ids", nullable = false, length = 40)
    private String foundIds = "";

    @Column(name = "hinted_ids", nullable = false, length = 40)
    private String hintedIds = "";

    @Column(name = "wrong_taps", nullable = false)
    private int wrongTaps;

    @Column(name = "hints_used", nullable = false)
    private int hintsUsed;

    public SpotPuzzlePlay(Long puzzleId, Long userId, LocalDateTime startedAt) {
        this.puzzleId = puzzleId;
        this.userId = userId;
        this.startedAt = startedAt;
    }

    public boolean isFinished() {
        return finishedAt != null;
    }

    public Set<Integer> found() {
        return parse(foundIds);
    }

    public Set<Integer> hinted() {
        return parse(hintedIds);
    }

    /** 새로 찾음 — 다 찾았으면 끝낸 시각을 적는다 */
    public void hit(int diffId, int total, LocalDateTime now) {
        Set<Integer> f = found();
        if (!f.add(diffId)) return;
        foundIds = join(f);
        if (f.size() >= total) finishedAt = now;
    }

    public void miss() {
        wrongTaps++;
    }

    /** 힌트 — 같은 차이에 두 번 세지 않는다 */
    public void hint(int diffId) {
        Set<Integer> h = hinted();
        if (h.add(diffId)) {
            hintedIds = join(h);
            hintsUsed++;
        }
    }

    /** 걸린 시간(ms) — 끝냈으면 끝낸 시각까지, 아니면 {@code now} 까지 */
    public long elapsedMs(LocalDateTime now) {
        LocalDateTime end = finishedAt != null ? finishedAt : now;
        return Math.max(0, Duration.between(startedAt, end).toMillis());
    }

    private static Set<Integer> parse(String csv) {
        if (csv == null || csv.isBlank()) return new TreeSet<>();
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty())
                .map(Integer::valueOf).collect(Collectors.toCollection(TreeSet::new));
    }

    private static String join(Set<Integer> ids) {
        return ids.stream().sorted().map(String::valueOf).collect(Collectors.joining(","));
    }
}
