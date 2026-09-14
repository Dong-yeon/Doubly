package com.fitto.common.config;

import com.fitto.common.security.StompAuthChannelInterceptor;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP over WebSocket 설정 — 설계서 4.5 / 6.1.
 * 엔드포인트 /ws/chat, 구독 /sub, 발행 /pub. CONNECT 시 JWT 인증.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer, DisposableBean {

    /**
     * STOMP 하트비트 간격(ms) — 보내는 쪽·받는 쪽 같은 값.
     *
     * <p>클라이언트(@stomp/stompjs)의 기본값도 10초라 협상 결과가 그대로 10초가 된다.
     */
    private static final long HEARTBEAT_MILLIS = 10_000;

    private final StompAuthChannelInterceptor authChannelInterceptor;

    /**
     * 하트비트 전용 스케줄러 — <b>빈으로 등록하지 않는다.</b>
     *
     * <p>{@code TaskScheduler} 타입 빈이 하나라도 생기면 Spring Boot 의
     * {@code TaskSchedulingAutoConfiguration}({@code @ConditionalOnMissingBean(TaskScheduler.class)})
     * 이 물러나고, {@code @Scheduled}(통화 세션 스위퍼 등)가 이 스케줄러를 같이 쓰게 된다.
     * 그러면 {@code spring.task.scheduling.pool.size: 4} 설정이 조용히 무시되고 하트비트와
     * 배치 작업이 한 풀을 다툰다. 용도가 다르니 풀도 나눠 둔다.
     */
    private final ThreadPoolTaskScheduler heartbeatScheduler = createHeartbeatScheduler();

    public WebSocketConfig(StompAuthChannelInterceptor authChannelInterceptor) {
        this.authChannelInterceptor = authChannelInterceptor;
    }

    private static ThreadPoolTaskScheduler createHeartbeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1); // 빈 프레임 한 바이트를 주기적으로 흘리는 일이라 한 개면 충분하다
        scheduler.setThreadNamePrefix("stomp-heartbeat-");
        scheduler.setDaemon(true);
        scheduler.initialize();
        return scheduler;
    }

    @Override
    public void destroy() {
        heartbeatScheduler.shutdown();
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
        /*
         * 구독 prefix: /sub/rooms/{relationId}, 발행 prefix: /pub
         *
         * <p><b>하트비트를 켠다.</b> SimpleBroker 는 TaskScheduler 를 주지 않으면 하트비트가
         * 꺼진 채(0,0) 동작한다. 그러면 STOMP 협상 결과가 "양쪽 다 안 보냄"이 되어, 대화가
         * 없는 연결은 바이트가 한 톨도 흐르지 않는 유휴 상태가 된다. 그 상태를 클라우드
         * 프록시가 끊는다 — 정상 종료가 아니라 전송 오류로.
         *
         * <p>실제로 운영 통계가 그 모양이었다(2026-09-11):
         * {@code 17 total, 15 transport error}, {@code CONNECT(17)-CONNECTED(15)-DISCONNECT(0)}.
         * 정상 종료가 0건인데 전송 오류가 15건이면 끊은 건 사용자가 아니다. 끊길 때마다
         * 앱은 3초 뒤 다시 붙고(reconnectDelay), 그 사이 보낸 메시지는 재연결을 기다리느라
         * 최대 5초를 멈춘다(chatSocket.CONNECT_WAIT_MS) — "보내기가 안 눌린다"의 배경이다.
         *
         * <p>10초마다 흐르는 개행 한 바이트가 그 모두를 막는다. 앱이 백그라운드로 가면
         * 하트비트가 끊겨 서버가 연결을 정리하는데, 그건 좀비 연결을 남기는 것보다 낫다 —
         * 포그라운드로 돌아오면 클라이언트가 다시 붙는다.
         */
        registry.enableSimpleBroker("/sub")
                .setHeartbeatValue(new long[] {HEARTBEAT_MILLIS, HEARTBEAT_MILLIS})
                .setTaskScheduler(heartbeatScheduler);
        registry.setApplicationDestinationPrefixes("/pub");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authChannelInterceptor);
    }
}
