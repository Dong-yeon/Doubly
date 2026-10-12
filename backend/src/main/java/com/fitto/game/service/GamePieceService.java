package com.fitto.game.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
import com.fitto.game.dto.GamePieceResponse;
import com.fitto.relation.domain.Relation;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임 말 얼굴 — 우리 이모지 중 하나를 골라 계속 쓴다. 종목 공통(지금은 길막기가 쓴다).
 *
 * <p>예전엔 판 상황마다(차례·이김·짐) 표정을 바꿨는데 어지럽다는 의견이 있었다(2026-10-12). 사람이 고른 하나를
 * 상대도 똑같이 본다 — 그래서 기기가 아니라 서버(users.game_piece_emoji_id, V137)에 둔다.
 */
@Service
@Transactional(readOnly = true)
public class GamePieceService {

    private final GameCouples couples;
    private final UserRepository userRepository;
    private final CoupleEmojiRepository emojiRepository;
    private final CoupleEventPublisher coupleEventPublisher;

    public GamePieceService(GameCouples couples, UserRepository userRepository,
                            CoupleEmojiRepository emojiRepository, CoupleEventPublisher coupleEventPublisher) {
        this.couples = couples;
        this.userRepository = userRepository;
        this.emojiRepository = emojiRepository;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    public GamePieceResponse get(Long userId) {
        Relation couple = couples.active(userId);
        Long mine = pieceOf(userId);
        Long partnerId = couple.partnerOf(userId);
        Long theirs = partnerId == null ? null : pieceOf(partnerId);
        return new GamePieceResponse(mine, imageOf(mine, couple), theirs, imageOf(theirs, couple));
    }

    /**
     * 내 말 얼굴을 고른다 — 이 관계의 살아 있는 이모지만 된다(내 얼굴이든 상대 얼굴이든). null 이면 기본 말.
     * 상대 화면도 바뀌어야 하므로 게임 이벤트를 흘린다.
     */
    @Transactional
    public GamePieceResponse set(Long userId, Long emojiId) {
        Relation couple = couples.active(userId);
        if (emojiId != null) {
            emojiRepository.findByIdAndRelationIdAndDeletedAtIsNull(emojiId, couple.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.COUPLE_EMOJI_NOT_FOUND));
        }
        User me = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        me.setGamePieceEmojiId(emojiId);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return get(userId);
    }

    private Long pieceOf(Long userId) {
        return userRepository.findById(userId).map(User::getGamePieceEmojiId).orElse(null);
    }

    /** 지워졌거나 다른 관계의 이모지면 null — 앱이 기본 말로 그린다 */
    private String imageOf(Long emojiId, Relation couple) {
        if (emojiId == null) return null;
        return emojiRepository.findByIdAndRelationIdAndDeletedAtIsNull(emojiId, couple.getId())
                .map(CoupleEmoji::getImageUrl)
                .orElse(null);
    }
}
