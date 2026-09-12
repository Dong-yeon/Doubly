package com.fitto.chat.controller;

import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
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
             */
            log.debug("같은 멱등키가 동시에 들어와 중복 저장을 막았다 (relationId={})", relationId);
            return;
        }
        messagingTemplate.convertAndSend("/sub/rooms/" + relationId, saved);
    }
}
