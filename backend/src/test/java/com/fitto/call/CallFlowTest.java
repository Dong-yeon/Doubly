package com.fitto.call;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.call.domain.CallStatus;
import com.fitto.call.domain.CallType;
import com.fitto.call.dto.CallJoinResponse;
import com.fitto.call.dto.CallSessionResponse;
import com.fitto.call.dto.StartCallRequest;
import com.fitto.call.dto.StreamCredentialsResponse;
import com.fitto.call.service.CallService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
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

/** 통화 — PLAN.md "통화·영상통화" 통합 플로우. H2 기반(application-test.yml 의 더미 Stream 키 사용). */
@SpringBootTest
@ActiveProfiles("test")
class CallFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CallService callService;
    @Autowired ChatService chatService;

    /** 관계의 최신 메시지 1건 — getMessages 는 최신순이라 첫 항목이 곧 방금 남긴 카드다. */
    private ChatMessageResponse latestMessage(Long userId, Long relationId) {
        return chatService.getMessages(userId, relationId, null).get(0);
    }

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
    void 발신하면_RINGING_상태로_생기고_양쪽_모두_자격을_받는다() {
        Long a = register("call-a@fitto.com");
        Long b = register("call-b@fitto.com");
        connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));
        assertThat(joined.callSessionId()).isNotNull();
        assertThat(joined.callId()).isNotBlank();
        assertThat(joined.token()).isNotBlank();

        CallSessionResponse fromB = callService.get(b, joined.callId());
        assertThat(fromB.status()).isEqualTo(CallStatus.RINGING);
        assertThat(fromB.callType()).isEqualTo(CallType.VOICE);
    }

    @Test
    void 수락하면_ONGOING이_되고_종료하면_통화시간이_기록된다() {
        Long a = register("call-c@fitto.com");
        Long b = register("call-d@fitto.com");
        Long relationId = connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VIDEO));
        callService.accept(b, joined.callId());
        CallSessionResponse ended = callService.end(a, joined.callId());

        assertThat(ended.status()).isEqualTo(CallStatus.ENDED);
        assertThat(ended.startedAt()).isNotNull();
        assertThat(ended.durationSec()).isNotNull();

        // 정상 종료 카드 — 통화시간이 content 에 담긴다("VIDEO|ENDED|초")
        ChatMessageResponse card = latestMessage(a, relationId);
        assertThat(card.messageType()).isEqualTo(MessageType.CALL_CARD);
        assertThat(card.content()).isEqualTo("VIDEO|ENDED|" + ended.durationSec());
    }

    @Test
    void 받지_않은_채_끝나면_부재중이_되고_채팅에_카드가_남는다() {
        Long a = register("call-e@fitto.com");
        Long b = register("call-f@fitto.com");
        Long relationId = connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));
        CallSessionResponse ended = callService.end(a, joined.callId());

        assertThat(ended.status()).isEqualTo(CallStatus.MISSED);
        ChatMessageResponse card = latestMessage(a, relationId);
        assertThat(card.messageType()).isEqualTo(MessageType.CALL_CARD);
        assertThat(card.content()).isEqualTo("VOICE|MISSED");
        // 카드는 항상 발신자 명의로 남는다 — "누가 걸었는지"의 기록이라서
        assertThat(card.senderId()).isEqualTo(a);
    }

    @Test
    void 수신자가_거절하면_DECLINED가_되고_채팅에_카드가_남는다() {
        Long a = register("call-g@fitto.com");
        Long b = register("call-h@fitto.com");
        Long relationId = connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));
        CallSessionResponse declined = callService.decline(b, joined.callId());

        assertThat(declined.status()).isEqualTo(CallStatus.DECLINED);
        ChatMessageResponse card = latestMessage(a, relationId);
        assertThat(card.messageType()).isEqualTo(MessageType.CALL_CARD);
        assertThat(card.content()).isEqualTo("VOICE|DECLINED");
    }

    @Test
    void 이미_진행_중인_통화가_있으면_새로_걸_수_없다() {
        Long a = register("call-i@fitto.com");
        Long b = register("call-j@fitto.com");
        connectCouple(a, b);

        callService.start(a, new StartCallRequest(CallType.VOICE));

        assertThatThrownBy(() -> callService.start(b, new StartCallRequest(CallType.VOICE)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.CALL_ALREADY_ACTIVE));
    }

    @Test
    void 커플이_아니면_통화를_걸_수_없다() {
        Long solo = register("call-k@fitto.com");

        assertThatThrownBy(() -> callService.start(solo, new StartCallRequest(CallType.VOICE)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 당사자가_아니면_세션을_조회할_수_없다() {
        Long a = register("call-l@fitto.com");
        Long b = register("call-m@fitto.com");
        Long stranger = register("call-n@fitto.com");
        connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));

        assertThatThrownBy(() -> callService.get(stranger, joined.callId()))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.CALL_NOT_FOUND));
    }

    @Test
    void 통화_기록은_최신순으로_조회된다() {
        Long a = register("call-o@fitto.com");
        Long b = register("call-p@fitto.com");
        connectCouple(a, b);

        CallJoinResponse firstCall = callService.start(a, new StartCallRequest(CallType.VOICE));
        callService.end(a, firstCall.callId());
        CallJoinResponse secondCall = callService.start(a, new StartCallRequest(CallType.VIDEO));
        callService.end(a, secondCall.callId());

        List<CallSessionResponse> history = callService.list(a, null);
        assertThat(history).hasSize(2);
        assertThat(history.get(0).id()).isEqualTo(secondCall.callSessionId());
        assertThat(history.get(1).id()).isEqualTo(firstCall.callSessionId());
    }

    @Test
    void 로그인_사용자는_Stream_자격을_받을_수_있다() {
        Long a = register("call-q@fitto.com");

        StreamCredentialsResponse credentials = callService.credentials(a);
        assertThat(credentials.apiKey()).isEqualTo("test-stream-key");
        assertThat(credentials.userId()).isEqualTo(String.valueOf(a));
        assertThat(credentials.token()).isNotBlank();
    }
}
