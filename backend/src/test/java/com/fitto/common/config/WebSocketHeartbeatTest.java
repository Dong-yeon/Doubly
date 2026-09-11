package com.fitto.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * STOMP 하트비트 설정 — 유휴 연결이 프록시에 끊기지 않게 하는 장치.
 *
 * <p>하트비트가 꺼져 있으면(SimpleBroker 기본값 0,0) 대화 없는 연결에 바이트가 한 톨도
 * 흐르지 않아 클라우드 프록시가 끊는다. 운영 통계가 그 모양이었다(2026-09-11:
 * {@code 17 total, 15 transport error}, 정상 종료 0건).
 */
@SpringBootTest
@ActiveProfiles("test")
class WebSocketHeartbeatTest {

    @Autowired ApplicationContext context;
    @Autowired SimpleBrokerMessageHandler brokerMessageHandler;

    @Test
    void 브로커가_양방향_하트비트를_켠다() {
        assertThat(brokerMessageHandler.getHeartbeatValue())
                .as("하트비트가 꺼져 있으면(null 이거나 0,0) 유휴 연결이 프록시에 끊긴다")
                .isNotNull()
                .containsExactly(10_000L, 10_000L);
        assertThat(brokerMessageHandler.getTaskScheduler())
                .as("스케줄러가 없으면 설정한 하트비트 값이 실제로 나가지 않는다")
                .isNotNull();
    }

    /**
     * 하트비트 스케줄러를 빈으로 등록하지 않는다는 결정을 지킨다.
     *
     * <p>{@code @Scheduled}(통화 세션 스위퍼 등)는 이름이 {@code taskScheduler} 인 빈이 없으면
     * <b>타입으로</b> {@code TaskScheduler} 를 찾는다. 후보가 하나뿐이면 그걸 쓴다. 하트비트
     * 스케줄러를 빈으로 올리면 후보가 둘이 되어 배치 작업이 하트비트용 1스레드 풀로 밀려가거나
     * 기동이 모호해진다. 그래서 빈으로 만들지 않는다 — 이 테스트가 그 결정을 지킨다.
     *
     * <p><b>덤으로 드러난 사실</b>: {@code @EnableWebSocketMessageBroker} 가 등록하는
     * {@code messageBrokerTaskScheduler} 때문에 Boot 의 {@code TaskSchedulingAutoConfiguration}
     * ({@code @ConditionalOnMissingBean(TaskScheduler.class)})이 <b>이 변경 전부터</b> 물러나
     * 있었다. 그래서 {@code application.yml} 의 {@code spring.task.scheduling.pool.size: 4} 는
     * 지금 아무 효과가 없고, 모든 {@code @Scheduled} 가 브로커 스케줄러를 함께 쓴다.
     * 이 테스트는 그 사실을 <b>고정</b>할 뿐 옳다고 말하지 않는다 — 분리하려면 이름이
     * {@code taskScheduler} 인 빈을 따로 두어야 하고, 그건 이 변경의 범위가 아니다.
     */
    @Test
    void 하트비트_스케줄러를_빈으로_올리지_않는다() {
        assertThat(context.getBeanNamesForType(TaskScheduler.class))
                .as("하트비트 스케줄러가 빈이 되면 @Scheduled 의 스케줄러 선택이 흔들린다")
                .containsExactly("messageBrokerTaskScheduler");
    }
}
