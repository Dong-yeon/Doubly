package com.fitto.chat.service;

import com.fitto.chat.domain.ScheduledChatMessage;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.repository.ScheduledChatMessageRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 예약 메시지 한 건 발송/실패 처리 — {@link ScheduledChatMessageSweeper} 에서 분리한 이유는
 * 트랜잭션 경계 때문이다.
 *
 * <p>{@link #dispatch} 가 부르는 {@link ChatService#send} 는 자체가
 * {@code @Transactional}(REQUIRED)이라, 만약 스위퍼가 배치 전체를 하나의 트랜잭션으로 돌리며
 * 그 안에서 send() 를 호출했다면 — 한 건이 실패해 예외를 던지는 순간 스프링이 "같은
 * 물리 트랜잭션"에 rollback-only 를 걸어버려, 호출부가 그 예외를 잡아도 배치 전체가
 * 커밋 시점에 {@code UnexpectedRollbackException} 으로 죽는다(나머지 성공한 건까지 함께
 * 날아간다). 이 클래스를 별도 스프링 빈으로 두고 메서드마다 {@code REQUIRES_NEW} 를 걸어
 * 한 건 = 한 트랜잭션으로 완전히 격리한다(스위퍼가 자기 메서드를 직접 부르면 self-invocation
 * 이라 AOP 프록시를 안 타서 이 격리가 무의미해진다 — 그래서 별도 클래스로 뺐다).
 */
@Component
class ScheduledChatMessageDispatcher {

    private final ScheduledChatMessageRepository scheduledRepository;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    ScheduledChatMessageDispatcher(ScheduledChatMessageRepository scheduledRepository,
                                    ChatService chatService,
                                    SimpMessagingTemplate messagingTemplate) {
        this.scheduledRepository = scheduledRepository;
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    /** 발송 시도 — 실패하면 이 메서드의 트랜잭션(발송 포함) 전체가 롤백되고 예외가 호출자에게 전파된다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void dispatch(Long scheduledId) {
        ScheduledChatMessage scheduled = scheduledRepository.findById(scheduledId).orElse(null);
        // 이미 다른 사이클/경로에서 처리됐으면 조용히 넘어간다(중복 발송 방지).
        if (scheduled == null || !scheduled.isPending()) return;

        SendMessageRequest request = new SendMessageRequest(
                scheduled.getMessageType(), scheduled.getContent(), scheduled.getImageUrl(),
                null, null, null);
        ChatMessageResponse sent = chatService.send(scheduled.getSenderId(), scheduled.getRelationId(), request);
        scheduled.markSent(sent.id());
        messagingTemplate.convertAndSend("/sub/rooms/" + scheduled.getRelationId(), sent);
    }

    /** 발송 실패 처리 — dispatch() 의 롤백과 완전히 분리된 새 트랜잭션이라 취소 기록이 남는다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void markFailed(Long scheduledId) {
        scheduledRepository.findById(scheduledId).ifPresent(ScheduledChatMessage::cancel);
    }
}
