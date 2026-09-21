package com.fitto.game.dto;

/**
 * 연쇄 퍼즐 대전 라이브 이벤트 — 앱이 {@code /pub/games/{relationId}} 로 올리면 서버가 발신자를
 * 확인하고 {@code /sub/games/{relationId}} 로 그대로 흘린다(§2-5·§3-2).
 *
 * <p>{@code /sub/couple/{id}} 의 {@code CoupleEvent} 는 "타입만 보내고 REST 로 재조회"가
 * 규칙인데, 수(手)마다 재조회하면 그 왕복이 곧 게임의 지연이 된다. 그래서 채팅처럼 페이로드를
 * 싣는 채널을 따로 판다. 서버는 저장하지 않는다 — 판의 결과는 REST(finish)로 따로 온다.
 *
 * @param senderId      서버가 Principal 로 채운다. 클라이언트가 보낸 값은 무시한다
 * @param seq           보낸 쪽의 수(手) 번호 — 순서가 뒤바뀐 프레임을 버리는 기준
 * @param elapsedMs     보낸 쪽의 경과 시간
 * @param board         착지·연쇄·방해까지 끝난 뒤의 판(78자리 숫자열). 받는 쪽은 이걸 신뢰한다
 * @param garbageSent   상쇄 후 상대에게 나가는 방해 — 받는 쪽이 자기 핸디캡을 곱해 대기 큐에 넣는다
 * @param pendingGarbage 보낸 쪽에 남은 대기 방해(상대 패널 표시용)
 * @param lost          이 수로 판이 가득 찼다
 * @param item          이 수에 쓴 아이템(§13) — 상대 화면에 "쏜" 순간을 띄우는 용도. 0 이면 안 썼다
 */
public record PuzzleBattleEvent(
        Long senderId,
        Long gameId,
        int seq,
        int elapsedMs,
        String board,
        int garbageSent,
        int pendingGarbage,
        int score,
        int maxChain,
        boolean lost,
        int item
) {
    /** 판 문자열 길이 상한 — 6×13. 프론트 엔진의 WIDTH*HEIGHT 와 같다 */
    public static final int BOARD_LENGTH = 78;
    /** 아이템 코드 상한 — 프론트 items.ts 의 ITEM_ERASER */
    public static final int MAX_ITEM = 3;
    private static final int MAX_GARBAGE = 10_000;

    /** 서버가 발신자를 덮어쓴 사본 */
    public PuzzleBattleEvent from(Long userId) {
        return new PuzzleBattleEvent(userId, gameId, seq, elapsedMs, board, garbageSent,
                pendingGarbage, score, maxChain, lost, item);
    }

    /** 중계해도 되는 모양인가 — 상대 화면을 깨뜨릴 값만 거른다 */
    public boolean isSane() {
        if (gameId == null || seq < 0 || elapsedMs < 0) return false;
        if (board == null || board.length() != BOARD_LENGTH) return false;
        for (int i = 0; i < board.length(); i++) {
            char c = board.charAt(i);
            if (c < '0' || c > '5') return false;
        }
        if (item < 0 || item > MAX_ITEM) return false;
        return garbageSent >= 0 && garbageSent <= MAX_GARBAGE
                && pendingGarbage >= 0 && pendingGarbage <= MAX_GARBAGE
                && score >= 0 && maxChain >= 0;
    }
}
