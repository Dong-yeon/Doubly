package com.fitto.chat.controller;

import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatSendError;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.security.StompPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * STOMP 메시지 처리 — 클라이언트가 /pub/chat/{relationId} 로 발행하면
 * 영속 후 /sub/rooms/{relationId} 구독자에게 브로드캐스트한다. (설계서 4.5)
 */
@Controller
public class ChatStompController {

    private static final Logger log = LoggerFactory.getLogger(ChatStompController.class);

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatStompController(ChatService chatService, SimpMessagingTemplate messagingTemplate) {
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat/{relationId}")
    public void send(@DestinationVariable Long relationId,
                     @Payload SendMessageRequest request,
                     Principal principal) {
        // 인증되지 않은 세션이면 무시 (CONNECT 단계에서 JWT 검증되지만 방어적 처리)
        if (!(principal instanceof StompPrincipal stompPrincipal)) {
            return;
        }
        ChatMessageResponse saved;
        try {
            saved = chatService.send(stompPrincipal.userId(), relationId, request);
        } catch (DataIntegrityViolationException e) {
            /*
             * 같은 멱등키를 가진 프레임이 동시에 도착해 (relation_id, client_message_id) unique
             * 인덱스가 두 번째 INSERT 를 막은 경우다(V89). 서비스의 사전 조회가 놓치는 좁은
             * 경합이고, 먼저 처리된 쪽이 이미 저장·브로드캐스트했으므로 여기서는 조용히 끝낸다.
             * 브로드캐스트를 다시 하지 않는 이유: 보낸 쪽 말풍선은 그 첫 에코로 이미 맞춰진다.
             *
             * 단, 키가 정말 저장돼 있을 때만 그렇다. 다른 제약 위반(예: image_url 500자 초과)까지 이 경합으로
             * 보고 삼키면 거절을 알릴 길이 다시 사라진다.
             */
            if (chatService.isSaved(relationId, request.clientMessageId())) {
                log.debug("같은 멱등키가 동시에 들어와 중복 저장을 막았다 (relationId={})", relationId);
                return;
            }
            log.warn("채팅 저장 중 제약 위반 (relationId={}, senderId={})", relationId, stompPrincipal.userId(), e);
            reject(stompPrincipal, request, ErrorCode.INVALID_INPUT.name(), "보낼 수 없는 메시지예요.");
            return;
        } catch (BusinessException e) {
            // 예상한 거절(관계 종료·잠긴 팩·검증 실패) — 보낸 사람에게 그 이유를 돌려준다
            reject(stompPrincipal, request, e.getErrorCode().name(), e.getMessage());
            return;
        } catch (RuntimeException e) {
            // 예상 못 한 실패도 말풍선을 멈춰 두지 않는다. 원인은 서버 로그로 본다
            log.error("채팅 전송 처리 실패 (relationId={}, senderId={})", relationId, stompPrincipal.userId(), e);
            reject(stompPrincipal, request, ErrorCode.INTERNAL_ERROR.name(), "메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요.");
            return;
        }
        messagingTemplate.convertAndSend("/sub/rooms/" + relationId, saved);
    }

    /**
     * 거절 알림 — 보낸 사람의 세션들에게만 간다(/user/queue/chat-errors, 상대는 받지 않는다).
     *
     * <p>예전엔 아무것도 보내지 않아 앱 말풍선이 "보내는 중"에 멈췄다(docs/chat-current-state.md §8-2 ③).
     * 같은 사람의 다른 기기도 받지만, 앱은 자기가 만든 멱등키만 짝지으므로 상관없다.
     * 구버전 앱은 이 큐를 구독하지 않으니 예전과 같다.
     */
    private void reject(StompPrincipal principal, SendMessageRequest request, String code, String message) {
        messagingTemplate.convertAndSendToUser(principal.getName(), CHAT_ERRORS_QUEUE,
                new ChatSendError(request == null ? null : request.clientMessageId(), code, message));
    }

    /** 앱은 {@code /user/queue/chat-errors} 를 구독한다 — {@code convertAndSendToUser} 가 "/user" 를 붙인다. */
    static final String CHAT_ERRORS_QUEUE = "/queue/chat-errors";
}
