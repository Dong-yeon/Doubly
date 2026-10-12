package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
import com.fitto.game.dto.GamePieceResponse;
import com.fitto.game.service.GamePieceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 게임 말 얼굴(V137) — 고른 이모지 하나를 나도 상대도 본다. docs/pathlock-ux-analysis_2026-10-08.md §10 */
@SpringBootTest
@ActiveProfiles("test")
class GamePieceFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired GamePieceService pieceService;
    @Autowired CoupleEmojiRepository emojiRepository;

    private Long register(String prefix) {
        String email = prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@fitto.com";
        return authService.register(
                new RegisterRequest(email, "password123", prefix, null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    private Long connect(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code()).id();
    }

    private CoupleEmoji emoji(Long relationId, Long subject) {
        return emojiRepository.save(CoupleEmoji.builder()
                .relationId(relationId).createdBy(subject).subjectUserId(subject)
                .batchId(UUID.randomUUID().toString()).emotion(CoupleEmojiEmotion.HAPPY)
                .imageUrl("https://example.com/" + UUID.randomUUID() + ".png").promptVersion("v5").build());
    }

    @Test
    void 고른_얼굴을_나도_상대도_본다_비우면_기본_말() {
        Long a = register("pa");
        Long b = register("pb");
        Long relationId = connect(a, b);
        CoupleEmoji face = emoji(relationId, a);

        assertThat(pieceService.get(a).myEmojiId()).isNull();

        GamePieceResponse mine = pieceService.set(a, face.getId());
        assertThat(mine.myEmojiId()).isEqualTo(face.getId());
        assertThat(mine.myImageUrl()).isEqualTo(face.getImageUrl());

        GamePieceResponse theirs = pieceService.get(b);
        assertThat(theirs.partnerEmojiId()).isEqualTo(face.getId());
        assertThat(theirs.partnerImageUrl()).isEqualTo(face.getImageUrl());
        assertThat(theirs.myEmojiId()).isNull();

        assertThat(pieceService.set(a, null).myEmojiId()).isNull();
    }

    @Test
    void 다른_커플의_이모지는_고를_수_없다() {
        Long a = register("qa");
        Long b = register("qb");
        connect(a, b);
        Long c = register("qc");
        Long d = register("qd");
        Long otherRelation = connect(c, d);
        CoupleEmoji stranger = emoji(otherRelation, c);

        assertThatThrownBy(() -> pieceService.set(a, stranger.getId()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.COUPLE_EMOJI_NOT_FOUND);
    }
}
