package com.fitto.chat.repository;

import com.fitto.chat.domain.ScheduledChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ScheduledChatMessageRepository extends JpaRepository<ScheduledChatMessage, Long> {

    /** 스위퍼가 훑는 발송 대상 — 아직 발송·취소 안 됐고 예약 시각이 지난 것. 배치로 제한한다. */
    @Query("""
            select s from ScheduledChatMessage s
            where s.sentAt is null and s.canceledAt is null and s.scheduledAt <= :now
            order by s.scheduledAt asc
            """)
    List<ScheduledChatMessage> findDue(@Param("now") LocalDateTime now, Pageable pageable);

    /**
     * 발송 대상 한 건을 <b>원자적으로 선점</b>한다 — 성공하면 1, 이미 남이 집었으면 0.
     *
     * <p>조회 후 {@code isPending()} 을 보고 발송하는 검사-후-행동(check-then-act)은 스위퍼가 둘
     * 이상일 때(인스턴스 여러 대, 또는 테스트처럼 수동 호출이 백그라운드 사이클과 겹칠 때) 둘 다
     * "아직 대기 중"을 보고 <b>같은 메시지를 두 번 발송</b>한다. 조건부 UPDATE 는 DB 가 행 잠금으로
     * 직렬화하므로 뒤에 온 쪽이 0 을 돌려받고 조용히 빠진다.
     *
     * <p>{@code sentAt} 을 선점 표시로 겸한다(별도 컬럼 없이). 발송이 실패하면 호출자의 트랜잭션이
     * 통째로 롤백되어 이 표시도 함께 사라진다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ScheduledChatMessage s set s.sentAt = :now
            where s.id = :id and s.sentAt is null and s.canceledAt is null
            """)
    int claimForDispatch(@Param("id") Long id, @Param("now") LocalDateTime now);

    /** 방의 대기 중(미발송·미취소) 예약 목록 — 예약 시각 순. */
    @Query("""
            select s from ScheduledChatMessage s
            where s.relationId = :relationId and s.sentAt is null and s.canceledAt is null
            order by s.scheduledAt asc
            """)
    List<ScheduledChatMessage> findPending(@Param("relationId") Long relationId);

    long countByRelationIdAndSentAtIsNullAndCanceledAtIsNull(Long relationId);
}
