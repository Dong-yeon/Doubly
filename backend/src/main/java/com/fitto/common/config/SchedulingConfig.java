package com.fitto.common.config;

import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * {@code @Scheduled} 전용 스케줄러.
 *
 * <p><b>왜 직접 만드는가.</b> Spring Boot 의 {@code TaskSchedulingAutoConfiguration} 은
 * {@code @ConditionalOnMissingBean(TaskScheduler.class)} 이라, {@code TaskScheduler} 타입 빈이
 * 하나라도 있으면 물러난다. 그런데 {@code @EnableWebSocketMessageBroker}(WebSocketConfig)가
 * {@code messageBrokerTaskScheduler} 를 등록하므로 그 조건이 <b>항상</b> 깨진다.
 *
 * <p>그래서 이 클래스가 없으면 {@code application.yml} 의 {@code spring.task.scheduling.pool.size}
 * 가 <b>아무 효과도 내지 못하고</b>, 모든 {@code @Scheduled} 가 웹소켓 브로커의 스케줄러를 함께
 * 쓴다. 2026-09-11 하트비트 작업 중 테스트로 드러났다 — 그때까지 계속 그 상태였다.
 *
 * <p>둘을 섞으면 안 되는 이유는 성격이 다르기 때문이다. 브로커 스케줄러는 하트비트처럼
 * <b>제때</b> 돌아야 하는 짧은 일을 맡고, {@code @Scheduled} 쪽에는 통화 세션 스위퍼(5초마다)·
 * 재참여 알림·영수증 확인처럼 DB 와 외부 API 를 오가는 일이 있다. 뒤엣것이 풀을 물고 있으면
 * 앞엣것이 밀린다.
 *
 * <p>빈 이름이 {@code taskScheduler} 인 것이 중요하다 — 후보가 여럿일 때
 * {@code ScheduledAnnotationBeanPostProcessor} 는 이 이름으로 고른다.
 */
@Configuration
public class SchedulingConfig {

    /**
     * {@code spring.task.scheduling.*} 설정을 그대로 태운다 — 빌더는 Boot 가 여전히 제공한다
     * (자동 구성에서 물러난 것은 스케줄러 빈이지 빌더가 아니다).
     */
    @Bean
    public ThreadPoolTaskScheduler taskScheduler(ThreadPoolTaskSchedulerBuilder builder) {
        return builder.build();
    }
}
