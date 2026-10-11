package com.fitto.common.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
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

    /**
     * {@code @Scheduled} 의 <b>자동 실행</b>만 따로 켜고 끄는 스위치 — 스케줄러 빈(위)과는 분리돼 있다.
     *
     * <p><b>왜 나눴는가.</b> 테스트는 스위퍼를 직접 호출해 검증한다(5초를 실제로 기다릴 수 없으니).
     * 그런데 {@code @EnableScheduling} 이 켜져 있으면 <b>같은 스위퍼가 백그라운드에서도</b> 5초마다
     * 돈다. 테스트가 예약 시각을 과거로 되돌린 직후~직접 호출하기 전 사이에 백그라운드 사이클이
     * 끼어들면 같은 행을 둘이 동시에 집어 메시지가 두 번 발송된다. H2 인메모리 DB 는
     * ({@code jdbc:h2:mem:fitto;DB_CLOSE_DELAY=-1}) 테스트 컨텍스트 전체가 공유하므로, 전체 suite 처럼
     * 캐시된 컨텍스트가 여러 개 살아 있으면 스위퍼 스레드도 그만큼 늘어 확률이 곱으로 커진다 —
     * 2026-09-15 {@code ScheduledChatMessageFlowTest} 가 <b>전체 실행에서만</b> 깨진 원인이 이것이다.
     *
     * <p>그래서 테스트 프로파일({@code application-test.yml})에서
     * {@code fitto.scheduling.enabled: false} 로 자동 실행을 끈다. 스케줄러 빈 자체는 그대로 남으므로
     * {@code spring.task.scheduling.pool.size} 배선 검증({@code WebSocketHeartbeatTest})은 계속 돈다.
     * 운영·로컬은 기본값 true 라 아무것도 달라지지 않는다.
     */
    @Configuration
    @EnableScheduling
    @ConditionalOnProperty(name = "fitto.scheduling.enabled", havingValue = "true", matchIfMissing = true)
    public static class ScheduledTriggers {
    }
}
