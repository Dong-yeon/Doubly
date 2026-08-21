package com.fitto.call.service;

import com.fitto.call.domain.CallSession;
import com.fitto.call.domain.CallStatus;
import com.fitto.call.repository.CallSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 통화 세션 24시간 안전장치 — 종료 버튼을 안 누르거나 네트워크 유실로 종료 신호가
 * 안 온 세션을 강제 종료한다(운동 세션 24시간 자동 종료와 같은 이유, PLAN.md 스펙).
 * RINGING 은 MISSED 로, ONGOING 은 ENDED 로 정리된다({@link CallSession#end}).
 */
@Component
public class CallSessionSweeper {

    private static final Logger log = LoggerFactory.getLogger(CallSessionSweeper.class);

    private final CallSessionRepository callSessionRepository;

    public CallSessionSweeper(CallSessionRepository callSessionRepository) {
        this.callSessionRepository = callSessionRepository;
    }

    /** 매시 30분 — 하루 지난 활성 세션을 정리한다. */
    @Scheduled(cron = "0 30 * * * *", zone = "Asia/Seoul")
    @Transactional
    public void sweepStaleSessions() {
        LocalDateTime cutoff = LocalDateTime.now().minusHours(24);
        List<CallSession> stale = callSessionRepository.findByStatusInAndCreatedAtBefore(
                List.of(CallStatus.RINGING, CallStatus.ONGOING), cutoff);
        if (stale.isEmpty()) return;

        LocalDateTime now = LocalDateTime.now();
        stale.forEach(session -> session.end(now));
        log.info("통화 세션 강제 종료(24h 초과): {}건", stale.size());
    }
}
