package com.fitto.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
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
     * <p>{@code TaskScheduler} 빈은 둘이어야 한다 — 브로커 것과 {@code @Scheduled} 것
     * ({@link SchedulingConfig}). 하트비트 것이 여기 끼면 셋이 되고, 이름이 맞는 후보가
     * 없을 때의 선택이 흔들린다.
     */
    @Test
    void 하트비트_스케줄러를_빈으로_올리지_않는다() {
        // 빈 이름 목록을 통째로 고정하면 스프링 내부 빈이 늘 때마다 깨진다 — 의도만 못 박는다.
        assertThat(context.getBeansOfType(TaskScheduler.class).values())
                .filteredOn(ThreadPoolTaskScheduler.class::isInstance)
                .extracting(scheduler -> ((ThreadPoolTaskScheduler) scheduler).getThreadNamePrefix())
                .as("하트비트 스케줄러가 빈이 되면 @Scheduled 의 스케줄러 선택이 흔들린다")
                .doesNotContain("stomp-heartbeat-");
    }

    /**
     * {@code @Scheduled} 가 브로커 스케줄러를 함께 쓰지 않는다.
     *
     * <p>{@code @EnableWebSocketMessageBroker} 가 {@code messageBrokerTaskScheduler} 를 등록하는
     * 탓에 Boot 의 {@code TaskSchedulingAutoConfiguration} 이 늘 물러난다. {@link SchedulingConfig}
     * 가 없으면 {@code spring.task.scheduling.pool.size} 가 조용히 무시되고, 통화 세션 스위퍼
     * (5초마다) 같은 배치가 하트비트와 같은 풀을 다툰다.
     */
    @Test
    void 스케줄러가_브로커와_분리돼_설정한_풀을_쓴다() {
        assertThat(context.containsBean("taskScheduler"))
                .as("이름이 taskScheduler 인 빈이 있어야 @Scheduled 가 그걸 고른다")
                .isTrue();
        ThreadPoolTaskScheduler scheduler = context.getBean("taskScheduler", ThreadPoolTaskScheduler.class);
        assertThat(scheduler.getScheduledThreadPoolExecutor().getCorePoolSize())
                .as("spring.task.scheduling.pool.size 가 실제로 반영돼야 한다")
                .isEqualTo(4);
    }
}
