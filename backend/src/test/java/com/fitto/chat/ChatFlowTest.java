package com.fitto.chat;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 채팅 통합 플로우 (phase 4) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class ChatFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    ChatService chatService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null), "127.0.0.1").user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    @Test
    void 커플_채팅방에서_메시지를_주고받고_읽음처리한다() {
        Long a = register("ca@fitto.com");
        Long b = register("cb@fitto.com");
        Long relationId = connectCouple(a, b);

        ChatMessageResponse m1 = chatService.send(a, relationId,
                new SendMessageRequest(null, "오늘 운동 같이 하자!", null, null, null));
        assertThat(m1.id()).isNotNull();
        assertThat(m1.isRead()).isFalse();
        chatService.send(b, relationId, new SendMessageRequest(null, "좋아 💪", null, null, null));

        // B 입장 방 목록: 안 읽은 메시지 1개(A가 보낸 것), 마지막 메시지 존재
        ChatRoomResponse roomForB = chatService.getRooms(b).get(0);
        assertThat(roomForB.partner().id()).isEqualTo(a);
        assertThat(roomForB.unreadCount()).isEqualTo(1);
        assertThat(roomForB.lastMessage().content()).isEqualTo("좋아 💪");

        // 메시지 목록 최신순
        assertThat(chatService.getMessages(a, relationId, null)).hasSize(2);

        // B가 A의 메시지까지 읽음 처리 → 안 읽음 0
        chatService.markRead(b, m1.id());
        assertThat(chatService.getRooms(b).get(0).unreadCount()).isZero();
    }

    @Test
    void 관계에_속하지_않은_사용자는_메시지를_보낼_수_없다() {
        Long a = register("cc@fitto.com");
        Long b = register("cd@fitto.com");
        Long outsider = register("ce@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThatThrownBy(() -> chatService.send(outsider, relationId,
                new SendMessageRequest(null, "끼어들기", null, null, null)))
                .isInstanceOf(BusinessException.class);

        assertThatThrownBy(() -> chatService.getMessages(outsider, relationId, null))
                .isInstanceOf(BusinessException.class);
    }
}
