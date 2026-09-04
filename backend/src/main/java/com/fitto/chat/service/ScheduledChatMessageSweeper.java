package com.fitto.chat.service;

import com.fitto.chat.domain.ScheduledChatMessage;
import com.fitto.chat.repository.ScheduledChatMessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 예약 전송 실제 발송 — {@link com.fitto.call.service.CallSessionSweeper} 와 같은
 * "주기적 폴링" 패턴이다(전용 큐 인프라가 없어 이 방식이 이 코드베이스의 관례).
 *
 * <p>한 건 처리는 {@link ScheduledChatMessageDispatcher} 에 위임한다 — 이유는 그 클래스
 * 주석 참고(트랜잭션 격리를 위해 별도 빈으로 분리했다). 이 클래스 자체는
 * {@code @Transactional} 을 붙이지 않는다 — 붙이면 배치 조회와 각 건 처리가 다시 한
 * 트랜잭션으로 묶여 분리한 의미가 없어진다.
 */
@Component
public class ScheduledChatMessageSweeper {

    private static final Logger log = LoggerFactory.getLogger(ScheduledChatMessageSweeper.class);

    /** 한 번에 처리하는 최대 건수 — 폭주해도 한 사이클이 오래 걸리지 않도록. */
    private static final int BATCH_SIZE = 20;

    private final ScheduledChatMessageRepository scheduledRepository;
    private final ScheduledChatMessageDispatcher dispatcher;

    public ScheduledChatMessageSweeper(ScheduledChatMessageRepository scheduledRepository,
                                        ScheduledChatMessageDispatcher dispatcher) {
        this.scheduledRepository = scheduledRepository;
        this.dispatcher = dispatcher;
    }

    /** 5초마다 — 예약 시각이 지난 대기 메시지를 실제로 발송한다. */
    @Scheduled(fixedDelay = 5000)
    public void sweep() {
        List<Long> dueIds = scheduledRepository
                .findDue(LocalDateTime.now(), PageRequest.of(0, BATCH_SIZE)).stream()
                .map(ScheduledChatMessage::getId)
                .toList();
        if (dueIds.isEmpty()) return;

        int failed = 0;
        for (Long id : dueIds) {
            try {
                dispatcher.dispatch(id);
            } catch (Exception e) {
                // 관계가 끊기는 등 발송 시점에 조건이 깨진 경우 — 한 건 실패가 나머지 배치를
                // 막으면 안 되므로 별도 트랜잭션으로 취소 처리하고 다음 건으로 넘어간다.
                log.warn("예약 메시지 발송 실패, 취소 처리: scheduledId={}", id, e);
                dispatcher.markFailed(id);
                failed++;
            }
        }
        log.info("예약 메시지 발송 처리: {}건 (실패 {}건)", dueIds.size(), failed);
    }
}
