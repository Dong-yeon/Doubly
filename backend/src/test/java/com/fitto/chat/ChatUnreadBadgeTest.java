package com.fitto.chat;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.ChatRoomResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.chat.service.ChatUnreadCounter;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 앱 아이콘 배지 숫자 — "채팅이 왔는데 아이콘에 표시가 없다"(2026-10-08).
 *
 * <p>iOS 는 앱이 꺼져 있으면 payload badge 로만 아이콘 숫자를 바꾸고, 앱이 떠 있으면 앱이 방 목록
 * unreadCount 합으로 맞춘다. 두 숫자가 어긋나면 앱을 열 때마다 숫자가 튀므로 같은 값인지 고정한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ChatUnreadBadgeTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired ChatService chatService;
    @Autowired ChatUnreadCounter chatUnreadCounter;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false), "127.0.0.1").user().id();
    }

    private ChatMessageResponse send(Long sender, Long relationId, String text) {
        return chatService.send(sender, relationId, new SendMessageRequest(null, text, null, null, null, null, null));
    }

    @Test
    void 상대가_보낸_안_읽은_메시지만_세고_방_목록_합과_같다() {
        Long a = register("badge-a@fitto.com");
        Long b = register("badge-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        Long relationId = relationService.connectCouple(b, invite.code()).id();

        send(a, relationId, "하나");
        ChatMessageResponse second = send(a, relationId, "둘");
        send(b, relationId, "내가 보낸 건 내 배지에 안 센다");

        assertThat(chatUnreadCounter.totalUnread(b)).isEqualTo(2);
        assertThat(chatUnreadCounter.totalUnread(a)).isEqualTo(1);
        long roomsSum = chatService.getRooms(b).stream().mapToLong(ChatRoomResponse::unreadCount).sum();
        assertThat(chatUnreadCounter.totalUnread(b)).isEqualTo(roomsSum);

        chatService.markRead(b, second.id());
        assertThat(chatUnreadCounter.totalUnread(b)).isZero();
    }
}
