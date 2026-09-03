package com.fitto.chat.service;

import com.fitto.auth.dto.UserResponse;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.ChatMessageReaction;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.domain.StickerPack;
import com.fitto.chat.domain.StickerImage;
import com.fitto.chat.domain.TouchGesture;
import com.fitto.chat.dto.ChatBookmarkResponse;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatReactionSummary;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.LatestTouchResponse;
import com.fitto.chat.dto.ReplyPreview;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.domain.ChatMessageBookmark;
import com.fitto.chat.repository.ChatMessageBookmarkRepository;
import com.fitto.chat.repository.ChatMessageReactionRepository;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 채팅 서비스 — 설계서 3.4 / 4.5. 관계별 채팅방, 메시지 영속/조회/읽음.
 */
@Service
@Transactional(readOnly = true)
public class ChatService {

    private static final int PAGE_SIZE = 30;

    private final ChatMessageRepository chatMessageRepository;
    private final ChatMessageReactionRepository reactionRepository;
    private final ChatMessageBookmarkRepository bookmarkRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final PlanGuard planGuard;
    private final CoupleEventPublisher coupleEventPublisher;

    public ChatService(ChatMessageRepository chatMessageRepository,
                       ChatMessageReactionRepository reactionRepository,
                       ChatMessageBookmarkRepository bookmarkRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService,
                       PlanGuard planGuard,
                       CoupleEventPublisher coupleEventPublisher) {
        this.chatMessageRepository = chatMessageRepository;
        this.reactionRepository = reactionRepository;
        this.bookmarkRepository = bookmarkRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.planGuard = planGuard;
        this.coupleEventPublisher = coupleEventPublisher;
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
        List<ChatMessage> messages =
                chatMessageRepository.findMessages(relationId, cursor, PageRequest.of(0, PAGE_SIZE));
        return attachDetails(messages);
    }

    /**
     * 대화 검색 — 텍스트 메시지 본문 기준, 최신순 커서 페이징(전체 기간).
     *
     * <p>영구 보관인데 검색이 없어 반년 전 대화를 못 찾는다는 갭
     * (docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 1순위)을 메운다.
     */
    public List<ChatMessageResponse> searchMessages(Long userId, Long relationId, String keyword, Long cursor) {
        requireMember(userId, relationId);
        String trimmed = keyword == null ? "" : keyword.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        List<ChatMessage> messages = chatMessageRepository.searchMessages(
                relationId, escapeLike(trimmed), cursor, PageRequest.of(0, PAGE_SIZE));
        return attachDetails(messages);
    }

    /** LIKE 와일드카드(%, _)와 이스케이프 문자 자체를 리터럴로 만든다. */
    private String escapeLike(String keyword) {
        return keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** 사진 모아보기 — IMAGE 메시지 최신순 커서 페이징. 전면 무료(위 escapeLike 주석과 별개). */
    public List<ChatMessageResponse> getPhotos(Long userId, Long relationId, Long cursor) {
        requireMember(userId, relationId);
        List<ChatMessage> images =
                chatMessageRepository.findImages(relationId, cursor, PageRequest.of(0, PAGE_SIZE));
        return attachDetails(images);
    }

    /**
     * 중요 대화 저장/저장 취소 — 토글, 커플 공용(§3, UNIQUE(message_id)라 누가 눌러도
     * 같은 한 건). 게이팅 없음 — Feature 미등재(전면 무료).
     */
    @Transactional
    public boolean toggleBookmark(Long userId, Long messageId) {
        ChatMessage message = requireRoomMessage(userId, messageId);
        Optional<ChatMessageBookmark> existing = bookmarkRepository.findByMessageId(messageId);
        if (existing.isPresent()) {
            bookmarkRepository.delete(existing.get());
            return false;
        }
        // 삭제된 메시지는 리액션과 같은 규칙 — 이미 저장된 것은 냅두지만 새로 저장은 막는다
        if (message.isDeleted()) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        bookmarkRepository.save(ChatMessageBookmark.builder()
                .relationId(message.getRelationId())
                .messageId(messageId)
                .savedBy(userId)
                .build());
        return true;
    }

    /**
     * 저장한 대화 목록 — 저장한 순서(최신 저장이 위) 커서 페이징.
     *
     * <p>커서는 메시지 id 가 아니라 {@code bookmarkId} 다({@link ChatBookmarkResponse} 주석
     * 참고) — 목록 순서(저장한 순서)와 메시지 id(보낸 순서)가 다른 값이기 때문이다.
     */
    public List<ChatBookmarkResponse> getBookmarks(Long userId, Long relationId, Long cursor) {
        requireMember(userId, relationId);
        List<ChatMessageBookmark> page =
                bookmarkRepository.findPage(relationId, cursor, PageRequest.of(0, PAGE_SIZE));
        if (page.isEmpty()) return List.of();
        Map<Long, ChatMessage> byId = new LinkedHashMap<>();
        chatMessageRepository.findAllById(page.stream().map(ChatMessageBookmark::getMessageId).toList())
                .forEach(m -> byId.put(m.getId(), m));

        // attachDetails 는 입력 순서를 유지한다 — bookmark 목록 순서와 나란히 zip 한다
        List<ChatMessageBookmark> valid = page.stream()
                .filter(b -> byId.containsKey(b.getMessageId())).toList();
        List<ChatMessageResponse> details =
                attachDetails(valid.stream().map(b -> byId.get(b.getMessageId())).toList());

        List<ChatBookmarkResponse> result = new ArrayList<>(valid.size());
        for (int i = 0; i < valid.size(); i++) {
            result.add(new ChatBookmarkResponse(valid.get(i).getId(), details.get(i)));
        }
        return result;
    }

    /** 메시지 전송(영속 + 알림). 브로드캐스트는 호출자(STOMP 컨트롤러)가 담당. */
    @Transactional
    public ChatMessageResponse send(Long senderId, Long relationId, SendMessageRequest req) {
        Relation relation = requireMember(senderId, relationId);
        MessageType messageType = req.messageType() != null ? req.messageType() : MessageType.TEXT;
        if (messageType == MessageType.TOUCH) {
            requireValidTouch(senderId, req.content());
        }
        if (messageType == MessageType.STICKER && StickerPack.isPremium(req.content())) {
            // 시즌 스티커는 PRO 전용 — 터치 프리미엄 제스처와 같은 방어선이다(아래 주석 참고)
            planGuard.require(senderId, Feature.PREMIUM_STICKER);
        }

        ChatMessage message = ChatMessage.builder()
                .relationId(relationId)
                .senderId(senderId)
                .messageType(messageType)
                .content(req.content())
                .imageUrl(req.imageUrl())
                .workoutId(req.workoutId())
                .routineId(req.routineId())
                .replyToId(resolveReplyTarget(req.replyToId(), relationId))
                .build();
        chatMessageRepository.save(message);

        notifyRecipient(relation, senderId, message);
        if (messageType == MessageType.TOUCH) {
            // 홈 화면 등 채팅방 밖에서도 즉시 반응할 수 있도록 커플 채널에도 알린다
            // (수신측은 페이로드 없이 GET .../touch/latest 로 다시 조회 — 다른 CoupleEvent 와 동일 패턴)
            coupleEventPublisher.publish(relationId, CoupleEvent.TOUCH);
        }
        // 방금 만든 메시지라 북마크됐을 수 없다
        return ChatMessageResponse.from(message, replyPreview(message.getReplyToId()), List.of(), false);
    }

    /**
     * 시스템이 대신 남기는 카드 메시지(통화 결과 등) — {@link #send} 와 달리 <b>자동 알림이
     * 없다</b>. 상황마다 알릴지·누구에게·무슨 문구로 알릴지가 달라서(예: 통화는 부재중일
     * 때만 알리고 정상 종료·거절은 조용히 기록만 한다) 호출자가 필요하면 직접
     * {@link NotificationService} 를 부른다. 브로드캐스트도 호출자 책임(send 와 동일 원칙).
     */
    @Transactional
    public ChatMessageResponse postSystemCard(Long senderId, Long relationId, MessageType type, String content) {
        requireMember(senderId, relationId);
        ChatMessage message = ChatMessage.builder()
                .relationId(relationId)
                .senderId(senderId)
                .messageType(type)
                .content(content)
                .build();
        chatMessageRepository.save(message);
        return ChatMessageResponse.from(message);
    }

    /**
     * 가상 터치 제스처 검증 — 허용된 코드인지, 프리미엄 제스처면 PRO 인지.
     *
     * <p>STOMP 경로는 REST 처럼 402 를 그대로 클라이언트에 돌려줄 방법이 없다
     * (앱은 전송 전에 {@code usePlanStore.can()} 으로 미리 막는다 — PLAN.md 참고).
     * 여기 검증은 그 우회 방지용 방어선이다.
     */
    private void requireValidTouch(Long senderId, String content) {
        TouchGesture gesture = TouchGesture.from(content)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 터치 제스처예요."));
        if (gesture.isPremium()) {
            planGuard.require(senderId, Feature.TOUCH_GESTURE_PREMIUM);
        }
    }

    /** 내가 받은(상대가 보낸) 가장 최근 터치 — 홈 화면이 CoupleEvent.TOUCH 수신 시 조회한다. */
    public Optional<LatestTouchResponse> getLatestTouch(Long userId, Long relationId) {
        requireMember(userId, relationId);
        return chatMessageRepository
                .findTopByRelationIdAndMessageTypeAndSenderIdNotOrderByIdDesc(
                        relationId, MessageType.TOUCH, userId)
                .map(m -> new LatestTouchResponse(m.getId(), m.getSenderId(), m.getContent(), m.getCreatedAt()));
    }

    /**
     * 메시지 리액션 토글 — 같은 (message, user, emoji) 재요청 시 해제.
     *
     * @return 갱신된 리액션 요약 (호출자가 방 전체에 브로드캐스트한다)
     */
    @Transactional
    public List<ChatReactionSummary> toggleReaction(Long userId, Long messageId, String emoji) {
        ChatMessage message = requireRoomMessage(userId, messageId);
        // 삭제된 메시지에는 새 리액션을 달 수 없다 (이미 달린 것은 해제만 가능)
        reactionRepository.findByMessageIdAndUserIdAndEmoji(messageId, userId, emoji)
                .ifPresentOrElse(reactionRepository::delete, () -> {
                    if (message.isDeleted()) {
                        throw new BusinessException(ErrorCode.NOT_FOUND);
                    }
                    reactionRepository.save(ChatMessageReaction.builder()
                            .messageId(messageId)
                            .userId(userId)
                            .emoji(emoji)
                            .build());
                    if (!userId.equals(message.getSenderId())) {
                        notificationService.notify(message.getSenderId(), NotificationCategory.CHAT,
                                "메시지에 반응이 달렸어요",
                                userName(userId) + "님이 " + emoji + " 를 남겼어요",
                                PushLinks.chat(message.getRelationId()));
                    }
                });
        return summarize(reactionRepository.findByMessageId(messageId));
    }

    /** 메시지 수정 — 작성자 본인의 텍스트 메시지만. */
    @Transactional
    public ChatMessageResponse edit(Long userId, Long messageId, String content) {
        ChatMessage message = requireRoomMessage(userId, messageId);
        requireAuthor(message, userId);
        if (message.getMessageType() != MessageType.TEXT) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        message.edit(content);
        return detailOf(message);
    }

    /** 메시지 삭제 — 작성자 본인만. 행은 남기고 표시만 바꾼다(답장·리액션 참조 유지). */
    @Transactional
    public ChatMessageResponse delete(Long userId, Long messageId) {
        ChatMessage message = requireRoomMessage(userId, messageId);
        requireAuthor(message, userId);
        message.softDelete();
        return detailOf(message);
    }

    /**
     * 특정 메시지까지 읽음 처리 — 설계서 4.5 PUT /chat/read/{messageId}.
     *
     * @return 읽음이 반영된 관계 id — 호출자가 상대(발신자)에게 실시간으로 알릴 수 있도록 돌려준다.
     *         발신자는 자기 화면의 "읽음" 표시를 이 신호로 갱신한다.
     */
    @Transactional
    public Long markRead(Long userId, Long messageId) {
        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        requireMember(userId, message.getRelationId());
        chatMessageRepository.markReadUpTo(message.getRelationId(), messageId, userId);
        return message.getRelationId();
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
        notificationService.notify(recipientId, NotificationCategory.CHAT,
                senderName, preview(message), PushLinks.chat(message.getRelationId()));
    }

    /** 답장 대상이 같은 방의 메시지인지 확인 — 다른 방 메시지를 인용하면 대화가 새어나간다. */
    private Long resolveReplyTarget(Long replyToId, Long relationId) {
        if (replyToId == null) return null;
        ChatMessage target = chatMessageRepository.findById(replyToId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!target.getRelationId().equals(relationId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return replyToId;
    }

    /** 메시지가 내가 속한 방의 것인지 확인 — 남의 대화에 손대지 못하게. */
    private ChatMessage requireRoomMessage(Long userId, Long messageId) {
        ChatMessage message = chatMessageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        requireMember(userId, message.getRelationId());
        return message;
    }

    private void requireAuthor(ChatMessage message, Long userId) {
        if (!message.getSenderId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
    }

    /** 메시지 한 건에 답장 미리보기·리액션·북마크 여부를 붙인다. */
    private ChatMessageResponse detailOf(ChatMessage message) {
        return ChatMessageResponse.from(message, replyPreview(message.getReplyToId()),
                summarize(reactionRepository.findByMessageId(message.getId())),
                bookmarkRepository.existsByMessageId(message.getId()));
    }

    /**
     * 메시지 목록에 답장 미리보기·리액션·북마크 여부를 <b>배치로</b> 붙인다.
     * 메시지마다 개별 조회하면 30건에 60번 쿼리가 나간다.
     */
    private List<ChatMessageResponse> attachDetails(List<ChatMessage> messages) {
        if (messages.isEmpty()) return List.of();

        List<Long> ids = messages.stream().map(ChatMessage::getId).toList();
        Map<Long, List<ChatMessageReaction>> byMessage = new LinkedHashMap<>();
        for (ChatMessageReaction r : reactionRepository.findByMessageIdIn(ids)) {
            byMessage.computeIfAbsent(r.getMessageId(), k -> new ArrayList<>()).add(r);
        }
        Set<Long> bookmarked = bookmarkRepository.findByMessageIdIn(ids).stream()
                .map(ChatMessageBookmark::getMessageId).collect(Collectors.toSet());

        // 인용된 원본들을 한 번에 읽어 맵으로 (같은 원본을 여러 번 인용할 수 있다)
        List<Long> replyIds = messages.stream()
                .map(ChatMessage::getReplyToId).filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, ChatMessage> originals = new LinkedHashMap<>();
        if (!replyIds.isEmpty()) {
            chatMessageRepository.findAllById(replyIds).forEach(m -> originals.put(m.getId(), m));
        }

        List<ChatMessageResponse> result = new ArrayList<>(messages.size());
        for (ChatMessage m : messages) {
            ChatMessage original = m.getReplyToId() == null ? null : originals.get(m.getReplyToId());
            result.add(ChatMessageResponse.from(m, toPreview(original),
                    summarize(byMessage.getOrDefault(m.getId(), List.of())), bookmarked.contains(m.getId())));
        }
        return result;
    }

    private ReplyPreview replyPreview(Long replyToId) {
        if (replyToId == null) return null;
        return toPreview(chatMessageRepository.findById(replyToId).orElse(null));
    }

    private ReplyPreview toPreview(ChatMessage original) {
        if (original == null) return null;
        return new ReplyPreview(original.getId(), original.getSenderId(), original.getMessageType(),
                original.isDeleted() ? null : preview(original));
    }

    /** 이모지별 누른 사람 목록 — 등장 순서를 유지한다. mine 판단은 클라이언트 몫이다. */
    private List<ChatReactionSummary> summarize(List<ChatMessageReaction> reactions) {
        if (reactions.isEmpty()) return List.of();
        Map<String, List<Long>> byEmoji = new LinkedHashMap<>();
        for (ChatMessageReaction r : reactions) {
            byEmoji.computeIfAbsent(r.getEmoji(), k -> new ArrayList<>()).add(r.getUserId());
        }
        return byEmoji.entrySet().stream()
                .map(e -> new ChatReactionSummary(e.getKey(), e.getValue().size(), List.copyOf(e.getValue())))
                .toList();
    }

    /** 브로드캐스트용 메시지 상세 — 뷰어에 따라 달라지는 값이 없다. */
    public java.util.Optional<ChatMessageResponse> findForBroadcast(Long messageId) {
        return chatMessageRepository.findById(messageId).map(this::detailOf);
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("상대방");
    }

    private String preview(ChatMessage message) {
        return switch (message.getMessageType()) {
            case IMAGE -> "[이미지]";
            // 이모지 스티커는 이모지 자체가 가장 좋은 미리보기다. 이미지 스티커(StickerImage)는
            // content 가 "LOVE_BEAR" 같은 코드라 그대로 보여주면 안 되고 라벨로 바꿔야 한다.
            case STICKER -> StickerImage.from(message.getContent())
                    .map(s -> "[스티커] " + s.label())
                    .orElse(message.getContent() != null ? message.getContent() : "[스티커]");
            case WORKOUT_CARD -> "[운동 기록]";
            case MEAL_CARD -> "[식단]";
            case ROUTINE_CARD -> "[루틴]";
            // 알 수 없는 코드는 이론상 오지 않는다(전송 시점에 검증됨) — 방어적으로만 처리
            case TOUCH -> "[" + TouchGesture.from(message.getContent()).map(TouchGesture::label).orElse("터치") + "]";
            case CALL_CARD -> callCardPreview(message.getContent());
            case VOICE_MESSAGE -> "[음성 메시지]";
            default -> message.getContent();
        };
    }

    /**
     * 통화 카드 미리보기 — content 형식은 {@link MessageType#CALL_CARD} 참고.
     * MISSED/DECLINED 는 같은 문구로 보인다 — 거절인지 못 받은 건지 구분해 보여주지 않는다
     * (실제 전화 앱들의 관행과 동일. 발신자에게 "거절당했다"는 걸 굳이 드러내지 않는다).
     */
    private String callCardPreview(String content) {
        if (content == null || content.isBlank()) return "[통화]";
        String[] parts = content.split("\\|");
        boolean video = parts.length > 0 && "VIDEO".equals(parts[0]);
        String outcome = parts.length > 1 ? parts[1] : "";
        if ("ENDED".equals(outcome)) {
            return video ? "[영상통화 종료]" : "[통화 종료]";
        }
        return video ? "[부재중 영상통화]" : "[부재중 전화]";
    }
}
