package com.fitto.chat.repository;

import com.fitto.chat.domain.ScheduledChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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

    /** 방의 대기 중(미발송·미취소) 예약 목록 — 예약 시각 순. */
    @Query("""
            select s from ScheduledChatMessage s
            where s.relationId = :relationId and s.sentAt is null and s.canceledAt is null
            order by s.scheduledAt asc
            """)
    List<ScheduledChatMessage> findPending(@Param("relationId") Long relationId);

    long countByRelationIdAndSentAtIsNullAndCanceledAtIsNull(Long relationId);
}
