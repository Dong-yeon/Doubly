package com.fitto.game.spotdiff;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

/**
 * 틀린그림찾기 규칙 상수와 판정 — docs/spot-diff-design_2026-10-14.md 5절. 순수 계산이라 테스트가 직접 부른다.
 *
 * <p>worker 쪽 상수(짧은 변 1000px·긴 변 1600px·얼굴 1.3배 등)는 {@code worker/spot-diff/spot_worker/config.py} 에 있다.
 * 둘이 같이 봐야 하는 값은 {@link #DIFF_COUNT} 하나다.
 */
public final class SpotDiffRules {

    private SpotDiffRules() {
    }

    /** 화면·푸시·채팅 카드에 나가는 이름(임시값). 앱 {@code constants/spotDiff.ts} 와 같이 바꾼다 */
    public static final String DISPLAY_NAME = "틀린그림찾기";

    /** 생성 주기. DAILY = 커플당 하루 1판(KST 0시에 미리 생성), UNLIMITED = 다 풀면 다음 판 */
    public enum Mode { DAILY, UNLIMITED }

    public static final Mode MODE = Mode.DAILY;

    /** 차이 개수 — worker {@code config.DIFF_COUNT} 와 같아야 한다 */
    public static final int DIFF_COUNT = 5;

    /** 탭 허용치 — 이미지 짧은 변의 2% 를 정답 반지름에 더한다 */
    public static final double TOLERANCE_RATIO = 0.02;

    /** 힌트 원은 정답 원의 3배 */
    public static final double HINT_RADIUS_FACTOR = 3.0;

    /** 퍼즐 수명 — 생성 후 이 시간이 지나면 만료(결과 공개) */
    public static final Duration LIFETIME = Duration.ofHours(48);

    /** 이 기간 안에 퍼즐로 쓴 사진은 다시 고르지 않는다 */
    public static final int PHOTO_REUSE_DAYS = 30;

    /** 후보가 이보다 적으면 만들지 않는다(NOT_ENOUGH_PHOTOS) */
    public static final int MIN_PHOTOS = 5;

    /** 작업에 싣는 후보 상한 — 최근 사진부터 */
    public static final int MAX_CANDIDATES = 300;

    /** 정답 하나 — 좌표·반지름은 정규화값. r 은 <b>긴 변</b> 기준(시제품 diff_d.py 와 같다) */
    public record Diff(int id, String kind, double cx, double cy, double r) {
    }

    /** 원(정규화) — 응답용. r 은 긴 변 기준 */
    public record Circle(double cx, double cy, double r) {
    }

    /**
     * 탭 판정 — 픽셀 거리로 잰다(정규화 좌표 그대로 재면 가로세로 비율만큼 원이 찌그러진다).
     *
     * @return 맞힌 차이(가까운 순 첫 번째). 이미 찾은 것도 돌려준다 — 호출자가 REPEAT 로 가른다.
     *         새로 찾은 것을 우선한다: 두 원이 겹친 자리를 누르면 이미 찾은 쪽에 먹혀 없어지지 않게.
     */
    public static Optional<Diff> judge(List<Diff> diffs, Set<Integer> found, int width, int height,
                                       double x, double y) {
        Diff bestNew = null;
        double bestNewD = Double.MAX_VALUE;
        Diff bestOld = null;
        double bestOldD = Double.MAX_VALUE;
        for (Diff d : diffs) {
            double dist = pixelDistance(d, width, height, x, y);
            if (dist > threshold(d, width, height)) continue;
            if (found.contains(d.id())) {
                if (dist < bestOldD) { bestOld = d; bestOldD = dist; }
            } else if (dist < bestNewD) {
                bestNew = d;
                bestNewD = dist;
            }
        }
        return Optional.ofNullable(bestNew != null ? bestNew : bestOld);
    }

    /** 맞음 경계(px) = r + 짧은 변 × 허용치 */
    public static double threshold(Diff d, int width, int height) {
        return d.r() * Math.max(width, height) + TOLERANCE_RATIO * Math.min(width, height);
    }

    public static double pixelDistance(Diff d, int width, int height, double x, double y) {
        double dx = (x - d.cx()) * width;
        double dy = (y - d.cy()) * height;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 힌트 원 — 정답을 품는 3배 원. 중심은 정답 중심에서 (3r − r) 안쪽으로 비켜 둔다(힌트 가운데를 누르면
     * 바로 맞는 일이 없게). 같은 퍼즐·사람·차이면 같은 원이 나오도록 시드를 고정한다 — 다시 열어도 원이 움직이지 않는다.
     * 판이 가장자리에 붙어도 원이 이미지 밖으로 나가는 건 그대로 둔다(그려지는 건 화면이 자른다).
     */
    public static Circle hintCircle(Diff d, int width, int height, long seed) {
        Random rnd = new Random(seed);
        double big = d.r() * HINT_RADIUS_FACTOR;
        double maxShift = (big - d.r()) * 0.8; // 정답 원이 힌트 원 안에 넉넉히 들어가게
        double angle = rnd.nextDouble() * Math.PI * 2;
        double shift = maxShift * (0.4 + 0.6 * rnd.nextDouble());
        double longSide = Math.max(width, height);
        // r·shift 는 긴 변 기준 정규화 → 축마다 자기 길이로 나눈다
        double cx = d.cx() + Math.cos(angle) * shift * longSide / width;
        double cy = d.cy() + Math.sin(angle) * shift * longSide / height;
        return new Circle(cx, cy, big);
    }

    /** 힌트 시드 — 퍼즐 시드·사람·차이로 정한다 */
    public static long hintSeed(long puzzleSeed, long userId, int diffId) {
        return puzzleSeed * 31 + userId * 1_000_003L + diffId;
    }

    public static Circle circleOf(Diff d) {
        return new Circle(d.cx(), d.cy(), d.r());
    }
}
