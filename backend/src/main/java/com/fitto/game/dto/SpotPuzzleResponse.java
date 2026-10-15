package com.fitto.game.dto;

import com.fitto.game.spotdiff.SpotDiffRules;

import java.time.LocalDate;
import java.util.List;

/**
 * 틀린그림찾기 퍼즐 — <b>보는 사람 기준</b>. docs/spot-diff-design_2026-10-14.md 6절(블라인드).
 *
 * <p>정답 전체({@link Result#answers})와 상대 기록은 {@code result} 에만 있고, {@code result} 는 둘 다 끝냈거나
 * 퍼즐이 닫힌 뒤에만 채워진다. 그 전에 상대에 대해 알 수 있는 건 {@code partnerFound}(찾은 개수)뿐이다.
 *
 * @param status        PENDING / READY / NOT_ENOUGH_PHOTOS / FAILED / EXPIRED
 * @param closed        더 풀 수 없다(만료 — 정리 작업이 아직 상태를 안 바꿨어도 시간이 지났으면 true)
 * @param expireReason  TIME / PHOTO_REMOVED / null
 * @param remainingMs   닫힐 때까지 남은 시간(닫혔으면 0)
 * @param imageAUrl     READY 이거나 결과를 볼 수 있을 때만. 원본 사진이 지워졌으면 null
 */
public record SpotPuzzleResponse(
        Long id,
        String status,
        LocalDate puzzleDate,
        boolean closed,
        String expireReason,
        long remainingMs,
        String imageAUrl,
        String imageBUrl,
        Integer width,
        Integer height,
        int diffCount,
        String partnerName,
        Mine me,
        int partnerFound,
        Result result
) {

    /** 내가 찾은 차이 */
    public record Found(int id, double cx, double cy, double r) {
    }

    /**
     * 내 풀이. 열기 전이면 {@code started=false} 이고 나머지는 비어 있다.
     *
     * @param hints 받은 힌트 중 아직 못 찾은 것의 원(정답보다 3배 큰 원, 중심은 비켜 있다)
     */
    public record Mine(boolean started, boolean finished, List<Found> found, int wrongTaps, int hintsUsed,
                       List<SpotDiffRules.Circle> hints, long elapsedMs) {
    }

    /** 한 사람의 기록 — 결과에서만 */
    public record Record(boolean started, boolean finished, int found, Long elapsedMs, int wrongTaps, int hintsUsed) {
    }

    /** 결과 — 둘 다 끝났거나 닫힌 뒤에만 */
    public record Result(List<Answer> answers, Record me, Record partner) {
    }

    public record Answer(int id, String kind, double cx, double cy, double r) {
    }
}
