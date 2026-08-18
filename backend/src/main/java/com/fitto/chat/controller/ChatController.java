package com.fitto.chat.controller;

import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatReactionSummary;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.EditMessageRequest;
import com.fitto.chat.dto.LatestTouchResponse;
import com.fitto.chat.dto.ReadReceipt;
import com.fitto.feed.dto.ReactRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 채팅 REST API — 설계서 4.5. 메시지 목록/읽음. (이미지 업로드는 S3 연동 후 추가)
 */
@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(ChatService chatService, SimpMessagingTemplate messagingTemplate) {
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/rooms")
    public ApiResponse<List<ChatRoomResponse>> rooms(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(chatService.getRooms(user.id()));
    }

    @GetMapping("/rooms/{relationId}/messages")
    public ApiResponse<List<ChatMessageResponse>> messages(@AuthenticationPrincipal AuthUser user,
                                                           @PathVariable Long relationId,
                                                           @RequestParam(required = false) Long cursor) {
        return ApiResponse.success(chatService.getMessages(user.id(), relationId, cursor));
    }

    /**
     * 내가 받은 가장 최근 가상 터치 — 홈 화면이 {@code CoupleEvent.TOUCH} 수신 시 호출해
     * 햅틱을 발화한다(채팅방을 열지 않아도 반응하기 위함). 없으면 데이터 없이 200을 돌려준다.
     */
    @GetMapping("/{relationId}/touch/latest")
    public ApiResponse<LatestTouchResponse> latestTouch(@AuthenticationPrincipal AuthUser user,
                                                         @PathVariable Long relationId) {
        return ApiResponse.success(chatService.getLatestTouch(user.id(), relationId).orElse(null));
    }

    @PutMapping("/read/{messageId}")
    public ApiResponse<Void> read(@AuthenticationPrincipal AuthUser user,
                                  @PathVariable Long messageId) {
        Long relationId = chatService.markRead(user.id(), messageId);
        // 발신자 화면의 "읽음" 표시를 즉시 갱신한다 (메시지 스트림과 채널 분리)
        messagingTemplate.convertAndSend("/sub/rooms/" + relationId + "/read",
                new ReadReceipt(user.id(), messageId));
        return ApiResponse.success(null);
    }

    /**
     * 메시지 리액션 토글 — 같은 이모지를 다시 누르면 해제된다.
     * 갱신된 요약을 방 전체에 브로드캐스트해 양쪽 화면이 함께 바뀐다.
     */
    @PostMapping("/messages/{messageId}/reactions")
    public ApiResponse<List<ChatReactionSummary>> react(@AuthenticationPrincipal AuthUser user,
                                                        @PathVariable Long messageId,
                                                        @Valid @RequestBody ReactRequest request) {
        List<ChatReactionSummary> reactions =
                chatService.toggleReaction(user.id(), messageId, request.emoji());
        broadcastMessageChange(messageId);
        return ApiResponse.success(reactions);
    }

    /** 메시지 수정 — 작성자 본인의 텍스트 메시지만. */
    @PutMapping("/messages/{messageId}")
    public ApiResponse<ChatMessageResponse> edit(@AuthenticationPrincipal AuthUser user,
                                                 @PathVariable Long messageId,
                                                 @Valid @RequestBody EditMessageRequest request) {
        ChatMessageResponse updated = chatService.edit(user.id(), messageId, request.content());
        messagingTemplate.convertAndSend("/sub/rooms/" + updated.relationId() + "/updates", updated);
        return ApiResponse.success(updated, "메시지를 수정했어요.");
    }

    /** 메시지 삭제 — 작성자 본인만. 내용만 지우고 자리는 남는다. */
    @DeleteMapping("/messages/{messageId}")
    public ApiResponse<ChatMessageResponse> delete(@AuthenticationPrincipal AuthUser user,
                                                   @PathVariable Long messageId) {
        ChatMessageResponse deleted = chatService.delete(user.id(), messageId);
        messagingTemplate.convertAndSend("/sub/rooms/" + deleted.relationId() + "/updates", deleted);
        return ApiResponse.success(deleted, "메시지를 삭제했어요.");
    }

    /**
     * 바뀐 메시지를 방 구독자에게 알린다.
     * 메시지 스트림(/sub/rooms/{id})과 채널을 나눈 이유는 ReadReceipt 주석 참고 —
     * 그 채널의 페이로드는 '새 메시지'로만 해석되므로 갱신은 별도 채널로 보낸다.
     */
    private void broadcastMessageChange(Long messageId) {
        chatService.findForBroadcast(messageId).ifPresent(msg ->
                messagingTemplate.convertAndSend("/sub/rooms/" + msg.relationId() + "/updates", msg));
    }
}
