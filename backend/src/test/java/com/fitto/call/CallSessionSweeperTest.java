package com.fitto.call;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.call.domain.CallStatus;
import com.fitto.call.domain.CallType;
import com.fitto.call.dto.CallJoinResponse;
import com.fitto.call.dto.StartCallRequest;
import com.fitto.call.service.CallService;
import com.fitto.call.service.CallSessionSweeper;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 통화 30초 무응답 → 부재중 처리(CallSessionSweeper). PLAN.md "통화·영상통화" —
 * 네이티브 벨 웨이크업 없이 "부재중 전화, 채팅에서 다시 걸어주세요" 를 전달하는 경로.
 *
 * <p>{@code MemoriesNotifierTest} 와 같은 이유로 실제 발송 대신 호출만 검증한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class CallSessionSweeperTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CallService callService;
    @Autowired ChatService chatService;
    @Autowired CallSessionSweeper sweeper;

    /** 실제 Expo 발송 대신 호출만 기록한다 — 발송 대상·문구를 그대로 검증할 수 있다. */
    @MockitoBean NotificationService notificationService;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    /** RINGING 세션의 created_at 을 과거로 되돌린다 — 스케줄러가 "오래됐다"고 보게 만든다. */
    private void backdate(String providerCallId, LocalDateTime createdAt) {
        em.createNativeQuery("update call_sessions set created_at = :t where provider_call_id = :pid")
                .setParameter("t", createdAt)
                .setParameter("pid", providerCallId)
                .executeUpdate();
        em.flush();
        em.clear();
    }

    @Test
    @Transactional
    void 삼십초_넘게_응답없는_벨은_부재중_처리되고_카드와_알림이_남는다() {
        Long a = register("sweep-a@fitto.com");
        Long b = register("sweep-b@fitto.com");
        Long relationId = connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));
        backdate(joined.callId(), LocalDateTime.now().minusSeconds(31));

        sweeper.sweepUnansweredRinging();

        assertThat(callService.get(a, joined.callId()).status()).isEqualTo(CallStatus.MISSED);

        ChatMessageResponse card = chatService.getMessages(a, relationId, null).get(0);
        assertThat(card.messageType()).isEqualTo(MessageType.CALL_CARD);
        assertThat(card.content()).isEqualTo("VOICE|MISSED");

        verify(notificationService).notify(eq(b), eq("부재중 전화"), contains("다시 걸어보세요"));
    }

    @Test
    @Transactional
    void 아직_삼십초가_안_됐으면_그대로_둔다() {
        Long a = register("sweep-c@fitto.com");
        Long b = register("sweep-d@fitto.com");
        connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));
        backdate(joined.callId(), LocalDateTime.now().minusSeconds(10));

        sweeper.sweepUnansweredRinging();

        assertThat(callService.get(a, joined.callId()).status()).isEqualTo(CallStatus.RINGING);
    }

    /** 정상 종료·거절은 부재중이 아니므로 알림이 없다 — 당사자가 이미 아는 상황이라서. */
    @Test
    @Transactional
    void 정상_종료나_거절은_알림을_보내지_않는다() {
        Long a = register("sweep-e@fitto.com");
        Long b = register("sweep-f@fitto.com");
        connectCouple(a, b);

        CallJoinResponse joined = callService.start(a, new StartCallRequest(CallType.VOICE));
        callService.decline(b, joined.callId());

        verify(notificationService, never()).notify(any(), eq("부재중 전화"), anyString());
    }
}
