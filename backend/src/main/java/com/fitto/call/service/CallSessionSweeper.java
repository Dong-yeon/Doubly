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
 * 통화 세션 시간 기반 정리 — PLAN.md "통화·영상통화". 두 가지 안전장치를 겸한다.
 *
 * <ol>
 *   <li><b>30초 무응답 → MISSED.</b> 네이티브 벨 웨이크업이 없는 지금, 수신자가 앱을
 *       보고 있지 않으면 벨 자체가 안 뜬다. 그 상태로 발신자가 화면을 안 닫아도 채팅
 *       카드({@link CallService#recordOutcome})가 제때 남도록, 서버가 응답을 기다리지
 *       않고 짧은 시간 안에 스스로 부재중 처리한다 — "전화 왔었어요" 알림이 이 경로에
 *       전적으로 의존한다.</li>
 *   <li><b>24시간 안전장치.</b> 종료 버튼을 안 누르거나 네트워크 유실로 종료 신호가
 *       안 온 세션을 강제 종료한다(운동 세션 24시간 자동 종료와 같은 이유). 30초 판정을
 *       통과할 리 없는 RINGING 은 사실상 안 걸리고, ONGOING(통화 중 방치)만 대상이 된다.</li>
 * </ol>
 */
@Component
public class CallSessionSweeper {

    private static final Logger log = LoggerFactory.getLogger(CallSessionSweeper.class);

    /** 이 시간 동안 응답이 없으면 부재중으로 본다 — 네이티브 벨이 없어 짧게 잡는다. */
    private static final long RING_TIMEOUT_SECONDS = 30;

    private final CallSessionRepository callSessionRepository;
    private final CallService callService;

    public CallSessionSweeper(CallSessionRepository callSessionRepository, CallService callService) {
        this.callSessionRepository = callSessionRepository;
        this.callService = callService;
    }

    /** 5초마다 — 30초 넘게 응답 없는 벨을 부재중 처리한다. */
    @Scheduled(fixedDelay = 5000)
    @Transactional
    public void sweepUnansweredRinging() {
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(RING_TIMEOUT_SECONDS);
        List<CallSession> unanswered =
                callSessionRepository.findByStatusInAndCreatedAtBefore(List.of(CallStatus.RINGING), cutoff);
        if (unanswered.isEmpty()) return;

        LocalDateTime now = LocalDateTime.now();
        for (CallSession session : unanswered) {
            session.end(now); // RINGING 상태에서 end() 는 MISSED 로 정리한다
            callService.recordOutcome(session);
        }
        log.info("통화 부재중 처리(30s 무응답): {}건", unanswered.size());
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
        for (CallSession session : stale) {
            session.end(now);
            callService.recordOutcome(session);
        }
        log.info("통화 세션 강제 종료(24h 초과): {}건", stale.size());
    }
}
