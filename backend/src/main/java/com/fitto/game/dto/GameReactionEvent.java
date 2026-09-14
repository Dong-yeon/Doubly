package com.fitto.game.dto;

/**
 * 게임 판 위 즉석 반응 — {@code /sub/couple/{relationId}/game-reaction} 으로 나간다.
 *
 * <p>커플 공용 채널({@code /sub/couple/{relationId}})을 쓰지 않고 목적지를 나눈 이유:
 * 그 채널의 {@code CoupleEvent} 는 "타입만 보내고 수신측이 REST 로 다시 조회한다"가 규칙인데,
 * 반응은 저장하지 않으므로 다시 조회할 곳이 없다. 규칙을 깨는 대신 채널을 하나 더 판다.
 *
 * @param gameType SUDOKU / OMOK — 상대가 다른 게임 화면에 있으면 무시한다
 * @param senderId 보낸 사람 — 내가 보낸 것이 내 화면에 다시 뜨지 않도록 수신측이 거른다
 */
public record GameReactionEvent(
        String gameType,
        String reaction,
        String emoji,
        Long senderId,
        String senderName
) {
}
