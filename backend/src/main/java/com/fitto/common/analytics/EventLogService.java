package com.fitto.common.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 이벤트 로그 단일 발송 지점 — {@link com.fitto.common.notification.NotificationService#notify}
 * ·{@link com.fitto.common.event.CoupleEventPublisher#publish} 와 같은 패턴이다.
 *
 * <p>측정은 부가 기능이라 실패해도 본 동작(운동 저장·결제 등)을 막으면 안 된다 — 그래서
 * 저장 실패를 여기서 삼킨다. 다만 같은 트랜잭션 안에서 부르므로, DB 자체가 죽어 있는
 * 극단적인 경우엔 이 예외를 삼켜도 바깥 트랜잭션이 커밋 시점에 실패할 수 있다 — 그 경우는
 * 애초에 바깥 동작도 DB 에 못 쓰는 상황이라 로깅 실패가 원인이 아니다.
 */
@Service
public class EventLogService {

    private static final Logger log = LoggerFactory.getLogger(EventLogService.class);

    private final EventLogRepository repository;

    public EventLogService(EventLogRepository repository) {
        this.repository = repository;
    }

    public void log(Long userId, String eventType) {
        log(userId, null, eventType, null);
    }

    public void log(Long userId, String eventType, String detail) {
        log(userId, null, eventType, detail);
    }

    public void log(Long userId, Long relationId, String eventType, String detail) {
        try {
            repository.save(EventLog.builder()
                    .userId(userId)
                    .relationId(relationId)
                    .eventType(eventType)
                    .detail(detail)
                    .build());
        } catch (Exception e) {
            log.warn("이벤트 로그 저장 실패 — eventType={}, detail={}", eventType, detail, e);
        }
    }
}
