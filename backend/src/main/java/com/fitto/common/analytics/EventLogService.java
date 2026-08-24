package com.fitto.common.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이벤트 로그 단일 발송 지점 — {@link com.fitto.common.notification.NotificationService#notify}
 * ·{@link com.fitto.common.event.CoupleEventPublisher#publish} 와 같은 패턴이다.
 *
 * <p><b>왜 REQUIRES_NEW 인가 — 로그인이 500 으로 죽었던 이유.</b> 측정은 부가 기능이라
 * 실패해도 본 동작(로그인·운동 저장 등)을 막으면 안 된다. 그래서 아래에서 저장 실패를
 * 삼키는데, <b>바깥 트랜잭션에 얹혀 있으면 이 try/catch 가 아무 소용이 없다</b>:
 * <ol>
 *   <li>{@link com.fitto.auth.service.AuthService#login} 은 클래스 기본값인
 *       {@code @Transactional(readOnly = true)} 로 동작한다(로그인은 원래 읽기만 했다).</li>
 *   <li>읽기 전용 트랜잭션이면 Spring 이 JDBC 커넥션을 read-only 로 만들고, PostgreSQL 은
 *       그 안의 INSERT 를 거부한다({@code cannot execute INSERT in a read-only transaction}).
 *       {@code @GeneratedValue(IDENTITY)} 라 flush 를 미룰 수도 없어 저장 시점에 바로 터진다.</li>
 *   <li>예외를 여기서 삼켜도 이미 트랜잭션이 rollback-only 로 찍혀서, 커밋 시점에
 *       {@code UnexpectedRollbackException} 이 나고 응답은 500 이 된다.</li>
 * </ol>
 * 즉 <b>로그인만</b> 500 이 났다(회원가입·커플 연결 등 다른 지점은 이미 쓰기 트랜잭션 안이라
 * 무사했다). H2 는 read-only 커넥션을 무시해서 테스트로는 재현되지 않았다 — 그래서
 * {@code EventLogFlowTest} 에 읽기 전용 트랜잭션 케이스를 따로 두었다.
 *
 * <p>별도 트랜잭션으로 떼어내면 (1) 읽기 전용 문맥에서도 남길 수 있고 (2) 저장이 실패해도
 * 바깥 트랜잭션이 오염되지 않는다 — 이 클래스가 원래 하려던 "측정은 본 동작을 막지 않는다"가
 * 그제서야 실제로 성립한다. 반대급부로 바깥이 롤백돼도 로그는 남는데, {@code event_logs} 는
 * FK 없는 익명 집계 로그라(V57 마이그레이션 주석) 고아 행이 생겨도 해가 없다.
 */
@Service
@Transactional(propagation = Propagation.REQUIRES_NEW)
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
