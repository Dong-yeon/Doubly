package com.fitto.chat.service;

import com.fitto.auth.dto.UserResponse;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 채팅 서비스 — 설계서 3.4 / 4.5. 관계별 채팅방, 메시지 영속/조회/읽음.
 */
@Service
@Transactional(readOnly = true)
public class ChatService {

    private static final int PAGE_SIZE = 30;

    private final ChatMessageRepository chatMessageRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public ChatService(ChatMessageRepository chatMessageRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService) {
        this.chatMessageRepository = chatMessageRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    /** 내 채팅방 목록 (활성 관계별 1개). */
    public List<ChatRoomResponse> getRooms(Long userId) {
        return relationRepository.findAllByUser(userId).stream()
                .filter(Relation::isActive)
                .map(r -> {
                    Long partnerId = r.partnerOf(userId);
                    UserResponse partner = partnerId == null ? null
                            : userRepository.findById(partnerId).map(UserResponse::from).orElse(null);
                    ChatMessageResponse last = chatMessageRepository
                            .findTopByRelationIdOrderByIdDesc(r.getId())
                            .map(ChatMessageResponse::from).orElse(null);
                    long unread = chatMessageRepository
                            .countByRelationIdAndSenderIdNotAndIsReadFalse(r.getId(), userId);
                    return new ChatRoomResponse(r.getId(), r.getRelationType(), partner, last, unread);
                })
                .toList();
    }

    /** 방 메시지 — 최신순 커서 페이징. */
    public List<ChatMessageResponse> getMessages(Long userId, Long relationId, Long cursor) {
        requireMember(userId, relationId);
        return chatMessageRepository.findMessages(relationId, cursor, PageRequest.of(0, PAGE_SIZE))
                .stream().map(ChatMessageResponse::from).toList();
    }

    /** 메시지 전송(영속 + 알림). 브로드캐스트는 호출자(STOMP 컨트롤러)가 담당. */
    @Transactional
    public ChatMessageResponse send(Long senderId, Long relationId, SendMessageRequest req) {
        Relation relation = requireMember(senderId, relationId);

        ChatMessage message = ChatMessage.builder()
                .relationId(relationId)
                .senderId(senderId)
                .messageType(req.messageType() != null ? req.messageType() : MessageType.TEXT)
                .content(req.content())
                .imageUrl(req.imageUrl())
                .workoutId(req.workoutId())
                .routineId(req.routineId())
                .build();
        chatMessageRepository.save(message);

        notifyRecipient(relation, senderId, message);
        return ChatMessageResponse.from(message);
    }

    /** 특정 메시지까지 읽음 처리 — 설계서 4.5 PUT /chat/read/{messageId}. */
    @Transactional
    public void markRead(Long userId, Long messageId) {
        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        requireMember(userId, message.getRelationId());
        chatMessageRepository.markReadUpTo(message.getRelationId(), messageId, userId);
    }

    // ---- helpers ----

    /**
     * 방 접근 권한 검사 — 구성원 여부 <b>와</b> 관계 활성 여부를 모두 본다.
     *
     * <p>구성원 검사만 하면 연결을 끊은 뒤에도 상대가 계속 메시지를 보내고 과거 대화를
     * 읽을 수 있다. 종료된 관계도 user_a_id / user_b_id 를 그대로 보존하기 때문이다.
     * 방 목록(getRooms)에서만 ACTIVE 로 걸러도 소용없다 — relationId 를 알면 API 로 직접
     * 접근할 수 있고, 수신자에게는 푸시 알림이 그대로 전달된다.
     */
    private Relation requireMember(Long userId, Long relationId) {
        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (!relation.involves(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (!relation.isActive()) {
            throw new BusinessException(ErrorCode.RELATION_NOT_ACTIVE);
        }
        return relation;
    }

    private void notifyRecipient(Relation relation, Long senderId, ChatMessage message) {
        Long recipientId = relation.partnerOf(senderId);
        if (recipientId == null) {
            return;
        }
        String senderName = userRepository.findById(senderId).map(User::getName).orElse("상대방");
        notificationService.notify(recipientId, senderName, preview(message));
    }

    private String preview(ChatMessage message) {
        return switch (message.getMessageType()) {
            case IMAGE -> "[이미지]";
            // 스티커는 이모지 자체가 가장 좋은 미리보기다
            case STICKER -> message.getContent() != null ? message.getContent() : "[스티커]";
            case WORKOUT_CARD -> "[운동 기록]";
            case MEAL_CARD -> "[식단]";
            case ROUTINE_CARD -> "[루틴]";
            default -> message.getContent();
        };
    }
}
