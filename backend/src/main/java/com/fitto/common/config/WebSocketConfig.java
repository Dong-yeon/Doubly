package com.fitto.common.config;

import com.fitto.common.security.StompAuthChannelInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP over WebSocket 설정 — 설계서 4.5 / 6.1.
 * 엔드포인트 /ws/chat, 구독 /sub, 발행 /pub. CONNECT 시 JWT 인증.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor authChannelInterceptor;

    public WebSocketConfig(StompAuthChannelInterceptor authChannelInterceptor) {
        this.authChannelInterceptor = authChannelInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Origin 은 제한하지 않는다: 쿠키 인증이 없어 CSWSH 위험이 없고(STOMP CONNECT 에서
        // JWT 필수 — StompAuthChannelInterceptor), 네이티브(RN) 클라이언트의 Origin 값이
        // 플랫폼마다 달라 화이트리스트가 오히려 채팅을 끊을 수 있다.
        registry.addEndpoint("/ws/chat").setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 구독 prefix: /sub/rooms/{relationId}, 발행 prefix: /pub
        registry.enableSimpleBroker("/sub");
        registry.setApplicationDestinationPrefixes("/pub");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authChannelInterceptor);
    }
}
