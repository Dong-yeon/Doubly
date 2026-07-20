package com.fitto.common.security;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * STOMP 구독 인가 (보안).
 *
 * <p>관계 스코프 채널(/sub/rooms/, /sub/couple/)은 <b>둘 다</b> 활성 구성원만 구독할 수 있어야 한다.
 * 예전에는 /sub/couple/ 이 인가에서 누락돼, 아무 로그인 사용자나 임의 relationId 를 구독해
 * 남의 커플 실시간 이벤트(피드/기념일/여행…)를 받을 수 있었다.
 */
@SpringBootTest
@ActiveProfiles("test")
class StompSubscriptionAuthTest {

    private static final String IP = "127.0.0.1";

    @Autowired StompAuthChannelInterceptor interceptor;
    @Autowired AuthService authService;
    @Autowired RelationService relationService;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code()).id();
    }

    /** 실제 STOMP 세션은 CONNECT 때 심은 Principal 을 이후 프레임에 다시 붙인다 — 이를 재현. */
    private Message<byte[]> subscribeFrame(Long userId, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        accessor.setSessionId("test-session");
        if (userId != null) {
            accessor.setUser(new StompPrincipal(userId, "USER"));
        }
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private void subscribe(Long userId, String destination) {
        interceptor.preSend(subscribeFrame(userId, destination), new StubChannel());
    }

    // --- /sub/couple/ (이번에 막은 채널) ---

    @Test
    void 커플_이벤트_채널은_구성원만_구독할_수_있다() {
        Long a = register("stomp-cp-a@fitto.com");
        Long b = register("stomp-cp-b@fitto.com");
        Long outsider = register("stomp-cp-out@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThatCode(() -> subscribe(a, "/sub/couple/" + relationId))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> subscribe(outsider, "/sub/couple/" + relationId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 연결을_끊으면_커플_이벤트_채널을_구독할_수_없다() {
        Long a = register("stomp-cp-end-a@fitto.com");
        Long b = register("stomp-cp-end-b@fitto.com");
        Long relationId = connectCouple(a, b);
        relationService.endRelation(a, relationId);

        assertThatThrownBy(() -> subscribe(a, "/sub/couple/" + relationId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // --- /sub/rooms/ (기존 채널 — 회귀 방지) ---

    @Test
    void 채팅방은_여전히_구성원만_구독할_수_있다() {
        Long a = register("stomp-rm-a@fitto.com");
        Long b = register("stomp-rm-b@fitto.com");
        Long outsider = register("stomp-rm-out@fitto.com");
        Long relationId = connectCouple(a, b);

        assertThatCode(() -> subscribe(b, "/sub/rooms/" + relationId))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> subscribe(outsider, "/sub/rooms/" + relationId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // --- 공통 방어 ---

    @Test
    void 인증되지_않은_구독은_거부된다() {
        assertThatThrownBy(() -> subscribe(null, "/sub/couple/1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 존재하지_않는_관계_구독은_거부된다() {
        Long a = register("stomp-missing@fitto.com");
        assertThatThrownBy(() -> subscribe(a, "/sub/couple/999999"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 관계_스코프가_아닌_경로는_검증을_건너뛴다() {
        Long a = register("stomp-other@fitto.com");
        // 인터셉터의 관심사가 아니므로 통과해야 한다(다른 계층이 다룸)
        assertThatCode(() -> subscribe(a, "/sub/notifications/" + a))
                .doesNotThrowAnyException();
    }

    /** preSend 는 채널 참조만 받고 사용하지 않는다 — 최소 스텁. */
    private static class StubChannel implements org.springframework.messaging.MessageChannel {
        @Override
        public boolean send(org.springframework.messaging.Message<?> message, long timeout) {
            return true;
        }
    }
}
