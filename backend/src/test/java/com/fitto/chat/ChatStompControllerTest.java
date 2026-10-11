package com.fitto.chat;

import com.fitto.chat.controller.ChatStompController;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatSendError;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.security.StompPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * STOMP 전송 거절 알림 — 서버가 거절하면 보낸 사람에게 이유를 돌려준다(docs/chat-current-state.md §8-2 ③).
 * 스프링 컨텍스트 없이 돈다 — @MockitoBean 조합은 컨텍스트를 하나 더 만들어 CI 힙을 먹는다(CLAUDE.md 6절).
 */
class ChatStompControllerTest {

    private static final Long RELATION = 10L;
    private static final StompPrincipal ME = new StompPrincipal(7L, "USER");
    private static final String QUEUE = "/queue/chat-errors";

    private final ChatService chatService = mock(ChatService.class);
    private final SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
    private final ChatStompController controller = new ChatStompController(chatService, template);

    private static SendMessageRequest text(String key) {
        return new SendMessageRequest(null, "안녕", null, null, null, null, key);
    }

    @Test
    void 저장되면_방에_브로드캐스트하고_거절은_보내지_않는다() {
        ChatMessageResponse saved = mock(ChatMessageResponse.class);
        when(chatService.send(eq(7L), eq(RELATION), any())).thenReturn(saved);

        controller.send(RELATION, text("k1"), ME);

        verify(template).convertAndSend("/sub/rooms/" + RELATION, (Object) saved);
        verify(template, never()).convertAndSendToUser(anyString(), anyString(), any());
    }

    @Test
    void 업무_거절은_코드와_문구를_멱등키와_함께_보낸_사람에게만_돌려준다() {
        when(chatService.send(eq(7L), eq(RELATION), any()))
                .thenThrow(new BusinessException(ErrorCode.RELATION_NOT_ACTIVE));

        controller.send(RELATION, text("k2"), ME);

        verify(template).convertAndSendToUser("7", QUEUE, new ChatSendError(
                "k2", "RELATION_NOT_ACTIVE", ErrorCode.RELATION_NOT_ACTIVE.getMessage()));
        verify(template, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void 예상_못_한_실패도_말풍선을_멈춰_두지_않는다() {
        when(chatService.send(eq(7L), eq(RELATION), any())).thenThrow(new IllegalStateException("boom"));

        controller.send(RELATION, text("k3"), ME);

        verify(template).convertAndSendToUser(eq("7"), eq(QUEUE), eq(new ChatSendError(
                "k3", "INTERNAL_ERROR", "메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요.")));
    }

    @Test
    void 같은_키의_동시_도착이면_조용히_끝낸다() {
        when(chatService.send(eq(7L), eq(RELATION), any())).thenThrow(new DataIntegrityViolationException("dup"));
        when(chatService.isSaved(RELATION, "k4")).thenReturn(true);

        controller.send(RELATION, text("k4"), ME);

        verify(template, never()).convertAndSendToUser(anyString(), anyString(), any());
        verify(template, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void 다른_제약_위반은_삼키지_않고_거절로_알린다() {
        when(chatService.send(eq(7L), eq(RELATION), any())).thenThrow(new DataIntegrityViolationException("too long"));
        when(chatService.isSaved(RELATION, "k5")).thenReturn(false);

        controller.send(RELATION, text("k5"), ME);

        verify(template).convertAndSendToUser("7", QUEUE,
                new ChatSendError("k5", "INVALID_INPUT", "보낼 수 없는 메시지예요."));
    }
}
