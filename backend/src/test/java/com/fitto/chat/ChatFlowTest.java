package com.fitto.chat;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.dto.ChatExportResponse;
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
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
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
    @Autowired
    PlatformTransactionManager transactionManager;
    @PersistenceContext
    EntityManager em;

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

    /** 가상 터치 — 타입과 제스처 코드가 보존되고, 받은 쪽이 최신 터치로 조회할 수 있다. */
    @Test
    void 가상_터치를_보내면_상대가_최신_터치로_조회한다() {
        Long a = register("ct-a@fitto.com");
        Long b = register("ct-b@fitto.com");
        Long relationId = connectCouple(a, b);

        ChatMessageResponse sent = chatService.send(a, relationId,
                new SendMessageRequest(com.fitto.chat.domain.MessageType.TOUCH, "PAT", null, null, null, null));
        assertThat(sent.messageType()).isEqualTo(com.fitto.chat.domain.MessageType.TOUCH);
        assertThat(sent.content()).isEqualTo("PAT");

        // 받은 사람(b) 기준 최신 터치 — 보낸 사람(a) 기준으로는 없어야 한다(자기 자신은 제외)
        var latestForB = chatService.getLatestTouch(b, relationId);
        assertThat(latestForB).isPresent();
        assertThat(latestForB.get().senderId()).isEqualTo(a);
        assertThat(latestForB.get().gestureType()).isEqualTo("PAT");

        assertThat(chatService.getLatestTouch(a, relationId)).isEmpty();
    }

    /** 알 수 없는 제스처 코드는 거부된다 — 클라이언트가 임의 문자열을 보내는 우회 방지. */
    @Test
    void 알_수_없는_터치_제스처는_거부된다() {
        Long a = register("cu-a@fitto.com");
        Long b = register("cu-b@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThatThrownBy(() -> chatService.send(a, relationId,
                new SendMessageRequest(com.fitto.chat.domain.MessageType.TOUCH, "NOT_A_GESTURE", null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
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

    /**
     * createdAt 은 @CreatedDate 라 저장 시점에 고정된다 — 기간 필터를 테스트하려면 뒤로
     * 옮긴다. {@code @Transactional} 을 이 메서드에 붙여도 소용없다 — 테스트가 이 메서드를
     * 직접(self-invocation) 호출해 AOP 프록시를 안 타므로, TransactionTemplate 으로
     * 명시적인 프로그래매틱 트랜잭션을 연다(ScheduledChatMessageFlowTest.backdate 와 동일).
     */
    private void backdate(Long messageId, java.time.LocalDateTime when) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                em.createNativeQuery("update chat_messages set created_at = :when where id = :id")
                        .setParameter("when", when).setParameter("id", messageId).executeUpdate());
        em.clear();
    }

    /** 대화 내보내기 — 오래된순으로 전체가 내려오고, 잘리지 않았다고 표시된다. */
    @Test
    void 대화_내보내기는_오래된순_전체를_내려준다() {
        Long a = register("ex-a@fitto.com");
        Long b = register("ex-b@fitto.com");
        Long relationId = connectCouple(a, b);

        chatService.send(a, relationId, new SendMessageRequest(null, "첫 메시지", null, null, null, null));
        chatService.send(b, relationId, new SendMessageRequest(null, "두번째 메시지", null, null, null, null));
        chatService.send(a, relationId, new SendMessageRequest(null, "세번째 메시지", null, null, null, null));

        ChatExportResponse export = chatService.exportMessages(a, relationId, null, null);
        assertThat(export.truncated()).isFalse();
        assertThat(export.totalCount()).isEqualTo(3);
        assertThat(export.messages()).extracting(ChatMessageResponse::content)
                .containsExactly("첫 메시지", "두번째 메시지", "세번째 메시지");
    }

    /**
     * from/to 기간 필터 — from 은 그날 00:00 부터, to 는 그날까지 <b>포함</b>해야 한다
     * (ChatService.exportMessages 의 "to+1일 미만" 처리 참고).
     */
    @Test
    void 대화_내보내기는_지정한_기간만_포함한다() {
        Long a = register("ex-c@fitto.com");
        Long b = register("ex-d@fitto.com");
        Long relationId = connectCouple(a, b);

        Long old = chatService.send(a, relationId,
                new SendMessageRequest(null, "옛날 메시지", null, null, null, null)).id();
        backdate(old, java.time.LocalDateTime.of(2020, 1, 1, 12, 0));
        Long inRange = chatService.send(a, relationId,
                new SendMessageRequest(null, "범위 안 메시지", null, null, null, null)).id();
        backdate(inRange, java.time.LocalDateTime.of(2026, 6, 15, 23, 59));
        Long tooLate = chatService.send(a, relationId,
                new SendMessageRequest(null, "범위 밖 메시지", null, null, null, null)).id();
        backdate(tooLate, java.time.LocalDateTime.of(2026, 7, 1, 0, 0));

        ChatExportResponse export = chatService.exportMessages(
                a, relationId, LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30));
        assertThat(export.totalCount()).isEqualTo(1);
        assertThat(export.messages()).extracting(ChatMessageResponse::content)
                .containsExactly("범위 안 메시지");
    }

    /** 관계에 속하지 않은 사람은 대화를 내보낼 수 없다. */
    @Test
    void 관계에_속하지_않은_사람은_대화를_내보낼_수_없다() {
        Long a = register("ex-e@fitto.com");
        Long b = register("ex-f@fitto.com");
        Long outsider = register("ex-g@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThatThrownBy(() -> chatService.exportMessages(outsider, relationId, null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    /** 공지 고정 — 처음 고정하면 즉시 조회되고, 다른 메시지로 고정하면 앞선 고정이 조용히 교체된다. */
    @Test
    void 공지_고정은_한_번에_하나만_유지되고_교체된다() {
        Long a = register("pin-a@fitto.com");
        Long b = register("pin-b@fitto.com");
        Long relationId = connectCouple(a, b);
        Long first = chatService.send(a, relationId,
                new SendMessageRequest(null, "약속 시간 저녁 7시", null, null, null, null)).id();
        Long second = chatService.send(b, relationId,
                new SendMessageRequest(null, "장소는 강남역", null, null, null, null)).id();

        assertThat(chatService.getPinned(a, relationId)).isNull();

        com.fitto.chat.dto.ChatPinResponse pinned1 = chatService.togglePin(a, first);
        assertThat(pinned1.relationId()).isEqualTo(relationId);
        assertThat(pinned1.pinned().id()).isEqualTo(first);
        assertThat(chatService.getPinned(b, relationId).id()).isEqualTo(first);

        // 다른 메시지로 교체 — 행이 하나뿐이라(UNIQUE) 앞선 고정은 자연히 사라진다
        com.fitto.chat.dto.ChatPinResponse pinned2 = chatService.togglePin(b, second);
        assertThat(pinned2.pinned().id()).isEqualTo(second);
        assertThat(chatService.getPinned(a, relationId).id()).isEqualTo(second);
    }

    /** 이미 고정된 메시지를 다시 고정하면 해제된다(토글). */
    @Test
    void 같은_메시지를_다시_고정하면_해제된다() {
        Long a = register("pin-c@fitto.com");
        Long b = register("pin-d@fitto.com");
        Long relationId = connectCouple(a, b);
        Long msgId = chatService.send(a, relationId,
                new SendMessageRequest(null, "공지", null, null, null, null)).id();

        chatService.togglePin(a, msgId);
        assertThat(chatService.getPinned(a, relationId)).isNotNull();

        com.fitto.chat.dto.ChatPinResponse toggled = chatService.togglePin(b, msgId);
        assertThat(toggled.pinned()).isNull();
        assertThat(chatService.getPinned(a, relationId)).isNull();
    }

    /** 명시적 해제(배너 X) — 어떤 메시지가 고정됐는지 몰라도 방 id만으로 해제된다. */
    @Test
    void 명시적_고정_해제는_방_id만으로_가능하다() {
        Long a = register("pin-e@fitto.com");
        Long b = register("pin-f@fitto.com");
        Long relationId = connectCouple(a, b);
        Long msgId = chatService.send(a, relationId,
                new SendMessageRequest(null, "공지", null, null, null, null)).id();
        chatService.togglePin(a, msgId);

        chatService.unpin(b, relationId);
        assertThat(chatService.getPinned(a, relationId)).isNull();
    }

    /** 삭제된 메시지는 새로 고정할 수 없다(북마크와 같은 규칙). */
    @Test
    void 삭제된_메시지는_고정할_수_없다() {
        Long a = register("pin-g@fitto.com");
        Long b = register("pin-h@fitto.com");
        Long relationId = connectCouple(a, b);
        Long msgId = chatService.send(a, relationId,
                new SendMessageRequest(null, "지울 메시지", null, null, null, null)).id();
        chatService.delete(a, msgId);

        assertThatThrownBy(() -> chatService.togglePin(a, msgId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.NOT_FOUND);
    }
}
