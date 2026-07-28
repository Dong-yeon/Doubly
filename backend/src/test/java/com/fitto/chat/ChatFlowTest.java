package com.fitto.chat;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatReactionSummary;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

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
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false), "127.0.0.1").user().id();
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
                new SendMessageRequest(null, "오늘 운동 같이 하자!", null, null, null, null));
        assertThat(m1.id()).isNotNull();
        assertThat(m1.isRead()).isFalse();
        chatService.send(b, relationId, new SendMessageRequest(null, "좋아 💪", null, null, null, null));

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
                new SendMessageRequest(null, "끼어들기", null, null, null, null)))
                .isInstanceOf(BusinessException.class);

        assertThatThrownBy(() -> chatService.getMessages(outsider, relationId, null))
                .isInstanceOf(BusinessException.class);
    }

    /**
     * 연결을 끊은 뒤에도 상대가 메시지를 보낼 수 있으면 안 된다.
     *
     * <p>관계를 종료해도 user_a_id / user_b_id 는 남아 있어 involves() 는 계속 true 다.
     * 방 목록에서만 걸러내면 relationId 를 아는 상대가 API 로 직접 메시지를 보낼 수 있고,
     * 수신자에게는 푸시 알림으로 내용이 그대로 전달된다 — 앱에서 막을 방법도 없다.
     */
    @Test
    void 연결을_끊으면_상대는_메시지를_보낼_수_없다() {
        Long a = register("cf@fitto.com");
        Long b = register("cg@fitto.com");
        Long relationId = connectCouple(a, b);

        chatService.send(a, relationId, new SendMessageRequest(null, "연결 중엔 정상", null, null, null, null));
        relationService.endRelation(b, relationId);

        assertThatThrownBy(() -> chatService.send(a, relationId,
                new SendMessageRequest(null, "헤어진 뒤에도 보내기", null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RELATION_NOT_ACTIVE);
    }

    @Test
    void 연결을_끊으면_과거_대화도_읽을_수_없다() {
        Long a = register("ch@fitto.com");
        Long b = register("ci@fitto.com");
        Long relationId = connectCouple(a, b);

        ChatMessageResponse sent = chatService.send(a, relationId,
                new SendMessageRequest(null, "지난 대화", null, null, null, null));
        relationService.endRelation(b, relationId);

        assertThatThrownBy(() -> chatService.getMessages(a, relationId, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RELATION_NOT_ACTIVE);

        assertThatThrownBy(() -> chatService.markRead(a, sent.id()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RELATION_NOT_ACTIVE);
    }

    @Test
    void 연결을_끊으면_양쪽_모두의_방_목록에서_사라진다() {
        Long a = register("cj@fitto.com");
        Long b = register("ck@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThat(chatService.getRooms(a)).hasSize(1);
        relationService.endRelation(a, relationId);

        assertThat(chatService.getRooms(a)).isEmpty();
        assertThat(chatService.getRooms(b)).isEmpty();
    }

    /** 스티커 — content 에 이모지를 담은 STICKER 타입으로 저장·조회된다. */
    @Test
    void 스티커_메시지를_보내면_타입과_내용이_보존된다() {
        Long a = register("cs-a@fitto.com");
        Long b = register("cs-b@fitto.com");
        Long relationId = connectCouple(a, b);

        ChatMessageResponse sent = chatService.send(a, relationId,
                new SendMessageRequest(com.fitto.chat.domain.MessageType.STICKER, "🥰", null, null, null, null));

        assertThat(sent.messageType()).isEqualTo(com.fitto.chat.domain.MessageType.STICKER);
        assertThat(sent.content()).isEqualTo("🥰");
        // 방 목록 마지막 메시지로도 노출된다
        assertThat(chatService.getRooms(b).get(0).lastMessage().content()).isEqualTo("🥰");
    }

    /** 리액션 — 같은 이모지를 다시 누르면 해제되고, 누른 사람 id 로 내려간다. */
    @Test
    void 메시지_리액션은_토글되고_누른_사람이_함께_내려온다() {
        Long a = register("cr-a@fitto.com");
        Long b = register("cr-b@fitto.com");
        Long relationId = connectCouple(a, b);
        Long msgId = chatService.send(a, relationId,
                new SendMessageRequest(null, "오늘 최고였어", null, null, null, null)).id();

        List<ChatReactionSummary> afterAdd = chatService.toggleReaction(b, msgId, "❤️");
        assertThat(afterAdd).hasSize(1);
        assertThat(afterAdd.get(0).emoji()).isEqualTo("❤️");
        assertThat(afterAdd.get(0).count()).isEqualTo(1);
        // mine 판단을 클라이언트가 하도록 누른 사람 id 를 준다
        assertThat(afterAdd.get(0).userIds()).containsExactly(b);

        // 목록 조회에도 실려 온다
        ChatMessageResponse listed = chatService.getMessages(a, relationId, null).get(0);
        assertThat(listed.reactions()).hasSize(1);

        // 같은 이모지를 다시 누르면 해제
        assertThat(chatService.toggleReaction(b, msgId, "❤️")).isEmpty();
    }

    /** 답장 — 인용한 원본 요약이 함께 내려오고, 다른 방 메시지는 인용할 수 없다. */
    @Test
    void 답장은_원본_요약을_함께_내려주고_다른_방_메시지는_인용할_수_없다() {
        Long a = register("cq-a@fitto.com");
        Long b = register("cq-b@fitto.com");
        Long relationId = connectCouple(a, b);
        Long original = chatService.send(a, relationId,
                new SendMessageRequest(null, "저녁 뭐 먹지?", null, null, null, null)).id();

        ChatMessageResponse reply = chatService.send(b, relationId,
                new SendMessageRequest(null, "파스타!", null, null, null, original));
        assertThat(reply.replyTo()).isNotNull();
        assertThat(reply.replyTo().id()).isEqualTo(original);
        assertThat(reply.replyTo().content()).isEqualTo("저녁 뭐 먹지?");

        // 다른 커플의 메시지는 인용 불가
        Long c = register("cq-c@fitto.com");
        Long d = register("cq-d@fitto.com");
        Long otherRoom = connectCouple(c, d);
        assertThatThrownBy(() -> chatService.send(c, otherRoom,
                new SendMessageRequest(null, "남의 대화 인용", null, null, null, original)))
                .isInstanceOf(BusinessException.class);
    }

    /** 수정·삭제 — 작성자 본인만 가능하고, 삭제해도 답장 참조는 살아있다. */
    @Test
    void 작성자만_수정_삭제할_수_있고_삭제해도_답장은_남는다() {
        Long a = register("ce-a@fitto.com");
        Long b = register("ce-b@fitto.com");
        Long relationId = connectCouple(a, b);
        Long msgId = chatService.send(a, relationId,
                new SendMessageRequest(null, "오탄가 있어요", null, null, null, null)).id();
        chatService.send(b, relationId,
                new SendMessageRequest(null, "괜찮아", null, null, null, msgId));

        // 남이 수정·삭제 불가
        assertThatThrownBy(() -> chatService.edit(b, msgId, "탈취"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> chatService.delete(b, msgId))
                .isInstanceOf(BusinessException.class);

        ChatMessageResponse edited = chatService.edit(a, msgId, "오타가 있었어요");
        assertThat(edited.content()).isEqualTo("오타가 있었어요");
        assertThat(edited.edited()).isTrue();

        ChatMessageResponse deleted = chatService.delete(a, msgId);
        assertThat(deleted.deleted()).isTrue();
        assertThat(deleted.content()).isNull();

        // 삭제된 원본을 인용한 답장은 그대로 남고, 미리보기 본문만 비워진다
        ChatMessageResponse reply = chatService.getMessages(b, relationId, null).stream()
                .filter(m -> "괜찮아".equals(m.content())).findFirst().orElseThrow();
        assertThat(reply.replyTo()).isNotNull();
        assertThat(reply.replyTo().content()).isNull();
    }
}
