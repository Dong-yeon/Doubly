package com.fitto.chat;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.domain.ScheduledChatMessage;
import com.fitto.chat.dto.ScheduleMessageRequest;
import com.fitto.chat.dto.ScheduledMessageResponse;
import com.fitto.chat.repository.ScheduledChatMessageRepository;
import com.fitto.chat.service.ChatService;
import com.fitto.chat.service.ScheduledChatMessageService;
import com.fitto.chat.service.ScheduledChatMessageSweeper;
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

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 예약 전송 (phase 4 후속) — H2 기반. 스위퍼는 실제 5초를 기다리지 않고 직접 호출한다. */
@SpringBootTest
@ActiveProfiles("test")
class ScheduledChatMessageFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired ChatService chatService;
    @Autowired ScheduledChatMessageService scheduledChatMessageService;
    @Autowired ScheduledChatMessageSweeper sweeper;
    @Autowired ScheduledChatMessageRepository scheduledRepository;
    @Autowired PlatformTransactionManager transactionManager;

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

    /**
     * 예약 시각을 과거로 되돌린다 — 서비스 검증(미래여야 함)을 우회해 스위퍼 발송을 즉시 재현.
     *
     * <p>{@code @Transactional} 을 메서드에 붙여도 소용없다 — 테스트 러너가 이 메서드를
     * 직접(self-invocation) 호출하므로 AOP 프록시를 안 타 트랜잭션이 열리지 않는다
     * ({@link ScheduledChatMessageDispatcher} 를 별도 빈으로 뺀 이유와 같은 함정). 그래서
     * {@link TransactionTemplate} 으로 명시적인 프로그래매틱 트랜잭션을 연다.
     */
    void backdate(Long scheduledId, LocalDateTime when) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            em.createNativeQuery("update scheduled_chat_messages set scheduled_at = :when where id = :id")
                    .setParameter("when", when).setParameter("id", scheduledId).executeUpdate();
        });
        em.clear();
    }

    @Test
    void 예약한_메시지는_시각이_지나면_스위퍼가_실제로_발송한다() {
        Long a = register("sched-a@fitto.com");
        Long b = register("sched-b@fitto.com");
        Long relationId = connectCouple(a, b);

        ScheduledMessageResponse scheduled = scheduledChatMessageService.schedule(a, relationId,
                new ScheduleMessageRequest(MessageType.TEXT, "생일 축하해!", null,
                        LocalDateTime.now().plusMinutes(10)));
        assertThat(scheduledChatMessageService.listPending(a, relationId)).hasSize(1);

        // 발송 전에는 채팅방에 아직 없다
        assertThat(chatService.getMessages(b, relationId, null)).isEmpty();

        backdate(scheduled.id(), LocalDateTime.now().minusSeconds(1));
        sweeper.sweep();

        // 발송 후: 채팅방에 실제 메시지가 생기고, 대기 목록에서는 빠진다
        List<com.fitto.chat.dto.ChatMessageResponse> messages = chatService.getMessages(b, relationId, null);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content()).isEqualTo("생일 축하해!");
        assertThat(scheduledChatMessageService.listPending(a, relationId)).isEmpty();
    }

    @Test
    void 발송_전에만_취소할_수_있고_본인만_취소할_수_있다() {
        Long a = register("sched-c@fitto.com");
        Long b = register("sched-d@fitto.com");
        Long relationId = connectCouple(a, b);

        ScheduledMessageResponse scheduled = scheduledChatMessageService.schedule(a, relationId,
                new ScheduleMessageRequest(MessageType.TEXT, "예약 문자", null,
                        LocalDateTime.now().plusHours(1)));

        // 상대는 남의 예약을 취소할 수 없다
        assertThatThrownBy(() -> scheduledChatMessageService.cancel(b, scheduled.id()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        scheduledChatMessageService.cancel(a, scheduled.id());
        assertThat(scheduledChatMessageService.listPending(a, relationId)).isEmpty();

        // 이미 취소된 것을 다시 취소할 수 없다
        assertThatThrownBy(() -> scheduledChatMessageService.cancel(a, scheduled.id()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);

        // 취소됐으니 스위퍼가 시각을 되돌려도 발송하지 않는다
        backdate(scheduled.id(), LocalDateTime.now().minusSeconds(1));
        sweeper.sweep();
        assertThat(chatService.getMessages(a, relationId, null)).isEmpty();
    }

    @Test
    void 예약_시각은_미래여야_하고_지원하지_않는_타입은_거부된다() {
        Long a = register("sched-e@fitto.com");
        Long b = register("sched-f@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThatThrownBy(() -> scheduledChatMessageService.schedule(a, relationId,
                new ScheduleMessageRequest(MessageType.TEXT, "과거 예약", null, LocalDateTime.now().minusMinutes(1))))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);

        assertThatThrownBy(() -> scheduledChatMessageService.schedule(a, relationId,
                new ScheduleMessageRequest(MessageType.WORKOUT_CARD, null, null, LocalDateTime.now().plusMinutes(5))))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }

    /** 발송 시점에 관계가 이미 끊겼으면 예외가 나야 하고, 스위퍼는 그 건만 취소 처리하고 계속 진행해야 한다. */
    @Test
    void 발송_시점에_관계가_끊겼으면_취소_처리되고_다른_예약_발송을_막지_않는다() {
        Long a = register("sched-g@fitto.com");
        Long b = register("sched-h@fitto.com");
        Long relationId = connectCouple(a, b);

        ScheduledMessageResponse willFail = scheduledChatMessageService.schedule(a, relationId,
                new ScheduleMessageRequest(MessageType.TEXT, "끊긴 뒤 발송 시도", null, LocalDateTime.now().plusMinutes(10)));

        Long c = register("sched-i@fitto.com");
        Long d = register("sched-j@fitto.com");
        Long otherRelationId = connectCouple(c, d);
        ScheduledMessageResponse willSucceed = scheduledChatMessageService.schedule(c, otherRelationId,
                new ScheduleMessageRequest(MessageType.TEXT, "정상 발송", null, LocalDateTime.now().plusMinutes(10)));

        relationService.endRelation(a, relationId);
        backdate(willFail.id(), LocalDateTime.now().minusSeconds(1));
        backdate(willSucceed.id(), LocalDateTime.now().minusSeconds(1));

        sweeper.sweep();

        ScheduledChatMessage failed = scheduledRepository.findById(willFail.id()).orElseThrow();
        assertThat(failed.isPending()).isFalse();
        assertThat(failed.getSentAt()).isNull(); // 발송 안 됨, 취소 처리됨

        assertThat(chatService.getMessages(c, otherRelationId, null)).hasSize(1);
    }
}
