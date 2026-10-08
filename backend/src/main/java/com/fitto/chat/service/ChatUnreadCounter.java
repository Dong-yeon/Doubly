package com.fitto.chat.service;

import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 한 사용자의 <b>안 읽은 채팅 총수</b> — 휴대폰 앱 아이콘 배지 숫자다.
 *
 * <p>iOS 는 앱이 꺼져 있을 때 아이콘 숫자를 푸시 payload 의 {@code badge} 로만 바꾼다. 그래서
 * 채팅 푸시를 보낼 때마다 이 값을 실어 보낸다({@code ExpoPushNotificationService}). 앱이 떠
 * 있을 때는 앱이 방 목록의 unreadCount 합으로 직접 맞춘다(frontend/src/utils/push.ts) —
 * 두 값이 어긋나지 않도록 {@link ChatService#getRooms} 와 같은 기준(활성 관계, 상대가 보낸
 * 안 읽은 메시지)으로 센다.
 *
 * <p>{@code ChatService} 에 두지 않은 이유는 순환 의존이다 — ChatService 가 이미
 * NotificationService(= 푸시 발송기)를 들고 있다.
 */
@Component
public class ChatUnreadCounter {

    private final RelationRepository relationRepository;
    private final ChatMessageRepository chatMessageRepository;

    public ChatUnreadCounter(RelationRepository relationRepository, ChatMessageRepository chatMessageRepository) {
        this.relationRepository = relationRepository;
        this.chatMessageRepository = chatMessageRepository;
    }

    @Transactional(readOnly = true)
    public long totalUnread(Long userId) {
        return relationRepository.findAllByUser(userId).stream()
                .filter(Relation::isActive)
                .mapToLong(r -> chatMessageRepository.countByRelationIdAndSenderIdNotAndIsReadFalse(r.getId(), userId))
                .sum();
    }
}
