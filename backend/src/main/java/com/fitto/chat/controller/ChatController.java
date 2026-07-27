package com.fitto.chat.controller;

import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.ReadReceipt;
import com.fitto.chat.service.ChatService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
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

    @PutMapping("/read/{messageId}")
    public ApiResponse<Void> read(@AuthenticationPrincipal AuthUser user,
                                  @PathVariable Long messageId) {
        Long relationId = chatService.markRead(user.id(), messageId);
        // 발신자 화면의 "읽음" 표시를 즉시 갱신한다 (메시지 스트림과 채널 분리)
        messagingTemplate.convertAndSend("/sub/rooms/" + relationId + "/read",
                new ReadReceipt(user.id(), messageId));
        return ApiResponse.success(null);
    }
}
