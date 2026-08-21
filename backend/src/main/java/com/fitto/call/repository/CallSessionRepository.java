package com.fitto.call.repository;

import com.fitto.call.domain.CallSession;
import com.fitto.call.domain.CallStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CallSessionRepository extends JpaRepository<CallSession, Long> {

    /**
     * 발신 응답 이후의 모든 조회는 이 키로 한다 — 캐리어는 Stream 이 준 {@code call.id}가
     * 우리 {@code provider_call_id}와 같다는 사실만 알 뿐, 내부 PK({@code id})는 발신자만
     * 응답으로 받는다. 수신자·양쪽 모두가 접근 가능한 유일한 공통 키가 이것이다.
     */
    Optional<CallSession> findByProviderCallId(String providerCallId);

    /** 같은 커플에 이미 진행 중(벨 울림·통화 중)인 세션이 있는가 — 동시 발신 방지. */
    boolean existsByCoupleIdAndStatusIn(Long coupleId, Collection<CallStatus> statuses);

    /** 통화 기록 첫 페이지 — 최신순. */
    List<CallSession> findTop30ByCoupleIdOrderByIdDesc(Long coupleId);

    /** 통화 기록 다음 페이지 — cursor(마지막으로 본 id) 이전. */
    List<CallSession> findTop30ByCoupleIdAndIdLessThanOrderByIdDesc(Long coupleId, Long cursor);

    /** 24시간 안전장치 대상 — 스케줄러(CallSessionSweeper)가 강제 종료한다. */
    List<CallSession> findByStatusInAndCreatedAtBefore(Collection<CallStatus> statuses, LocalDateTime cutoff);
}
