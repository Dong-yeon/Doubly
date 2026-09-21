package com.fitto.game.service;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * "상대가 지금 이 판을 보고 있는가"의 근사 — 게임 푸시를 보낼지 가르는 한 줄.
 *
 * <p>판이 <b>마지막으로 움직인 시각</b>만 본다. 소켓 연결 여부를 묻지 않는 이유는 연결이 곧
 * "화면을 보고 있다"가 아니기 때문이다(백그라운드에서도 붙어 있다). 마지막 수가 방금이면 둘이
 * 같이 하고 있는 중이고 그때 오는 푸시는 소음이다. 반대로 한참 조용했다면 그 푸시가 곧 게임의
 * 리듬이다 — 떨어져 있는 커플에게는 이 알림이 게임 그 자체다.
 *
 * <p>오목이 갖고 있던 판정을 스도쿠가 같이 쓰게 되면서 모았다({@link GameCouples} 와 같은 이유).
 * 길막기도 같은 판정을 쓸 자리다.
 */
final class GameQuiet {

    /** 차례제 게임(오목) — 수가 오가는 리듬이 짧아 조금만 조용해도 "자리를 떴다"로 본다. */
    static final Duration TURN = Duration.ofMinutes(2);

    /**
     * 차례가 없는 협동 게임(스도쿠) — 한 사람이 연달아 스무 칸을 채운다. 여기에 {@link #TURN} 을
     * 쓰면 한 판에 푸시가 여러 번 나가므로, <b>"판을 다시 잡았다"로 읽힐 만큼</b> 길게 둔다.
     */
    static final Duration SESSION = Duration.ofMinutes(20);

    private GameQuiet() {
    }

    /**
     * @param lastTouchedAt 판이 마지막으로 움직인 시각 — {@code null} 이면(아직 한 수도 없음)
     *                      {@code createdAt} 을 대신 쓴다
     * @return 그 뒤로 {@code window} 만큼 조용했으면 true. 둘 다 {@code null} 이면 보낸다
     */
    static boolean longEnough(LocalDateTime lastTouchedAt, LocalDateTime createdAt, Duration window) {
        LocalDateTime since = lastTouchedAt != null ? lastTouchedAt : createdAt;
        if (since == null) return true;
        return Duration.between(since, LocalDateTime.now()).compareTo(window) >= 0;
    }
}
