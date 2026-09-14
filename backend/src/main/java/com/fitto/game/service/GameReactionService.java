package com.fitto.game.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.GameReaction;
import com.fitto.game.domain.GameType;
import com.fitto.game.dto.GameReactionEvent;
import com.fitto.relation.domain.Relation;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 게임 판 위 즉석 반응 — 저장하지 않고 커플 채널로 흘려보낸다.
 * docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 1절.
 *
 * <p>푸시도, 채팅 기록도 남기지 않는다. 상대가 지금 그 판을 보고 있을 때만 의미가 있는 신호이고,
 * 안 보고 있을 때까지 알림으로 따라가면 그건 반응이 아니라 재촉이다.
 */
@Service
public class GameReactionService {

    /** 이 간격보다 빨리 오는 연타는 버린다 — 길게 누르고 있어도 소켓이 잠기지 않게 */
    static final long MIN_GAP_MILLIS = 500L;
    /** 마지막 발송 시각 맵의 상한 — 넘으면 통째로 비운다(스로틀이 잠깐 느슨해질 뿐 기능은 그대로) */
    private static final int THROTTLE_MAP_LIMIT = 10_000;

    private final GameCouples couples;
    private final SimpMessagingTemplate messagingTemplate;
    private final Map<Long, Long> lastSentAt = new ConcurrentHashMap<>();

    public GameReactionService(GameCouples couples, SimpMessagingTemplate messagingTemplate) {
        this.couples = couples;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * 반응 하나를 커플 채널로 보낸다.
     *
     * @return 실제로 보냈으면 true. 연타로 걸러졌으면 false — <b>오류가 아니다</b>.
     *         누른 사람 화면에서는 이미 애니메이션이 돌았는데 토스트로 실패를 알리면 더 이상하다.
     */
    public boolean send(Long userId, String gameTypeKey, String reactionKey) {
        GameReaction reaction = GameReaction.parse(reactionKey)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 반응이에요."));
        GameType gameType = parseGameType(gameTypeKey);
        Relation couple = couples.active(userId);

        if (!allow(userId)) return false;

        messagingTemplate.convertAndSend(
                "/sub/couple/" + couple.getId() + "/game-reaction",
                new GameReactionEvent(
                        gameType.name(),
                        reaction.name(),
                        reaction.emoji(),
                        userId,
                        couples.userName(userId)));
        return true;
    }

    private GameType parseGameType(String key) {
        if (key == null) throw new BusinessException(ErrorCode.INVALID_INPUT, "어떤 게임인지 알 수 없어요.");
        try {
            return GameType.valueOf(key.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 게임이에요.");
        }
    }

    private boolean allow(Long userId) {
        long now = System.currentTimeMillis();
        if (lastSentAt.size() > THROTTLE_MAP_LIMIT) lastSentAt.clear();
        Long previous = lastSentAt.put(userId, now);
        return previous == null || now - previous >= MIN_GAP_MILLIS;
    }
}
