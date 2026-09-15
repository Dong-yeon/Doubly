package com.fitto.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 테스트에서는 {@code @Scheduled} 가 <b>저절로</b> 돌지 않아야 한다.
 *
 * <p>2026-09-15: {@code ScheduledChatMessageFlowTest} 가 전체 suite 에서만 깨졌다. 테스트는
 * 스위퍼를 직접 호출하는데, 백그라운드 스케줄러도 같은 스위퍼를 5초마다 돌리고 있어서 같은 예약
 * 메시지를 둘이 동시에 집어 두 번 발송했다. H2 인메모리 DB 를 모든 테스트 컨텍스트가 공유하므로
 * (application-test.yml 의 {@code DB_CLOSE_DELAY=-1}) 캐시된 컨텍스트 수만큼 스위퍼 스레드가
 * 늘어 전체 실행에서만 확률이 올라갔다.
 *
 * <p>스케줄러 <b>빈</b>은 살아 있어야 한다({@link WebSocketHeartbeatTest} 가 풀 설정을 검증한다).
 * 꺼지는 것은 자동 트리거뿐이다.
 */
@SpringBootTest
@ActiveProfiles("test")
class SchedulingTriggerTest {

    @Autowired ApplicationContext context;

    @Test
    void 테스트에서는_스케줄_자동_실행이_꺼져_있다() {
        // 이 빈이 @Scheduled 를 실제 트리거로 등록하는 주체다 — @EnableScheduling 이 켜질 때만 생긴다.
        assertThat(context.getBeanNamesForType(ScheduledAnnotationBeanPostProcessor.class))
                .as("@Scheduled 가 백그라운드에서 돌면 테스트가 직접 호출한 스위퍼와 겹쳐 중복 처리가 난다")
                .isEmpty();
    }

    @Test
    void 스케줄러_빈_자체는_남아_있다() {
        assertThat(context.containsBean("taskScheduler"))
                .as("자동 실행만 끄는 것이지 스케줄러 배선까지 없애면 운영 설정을 검증할 수 없다")
                .isTrue();
    }
}
