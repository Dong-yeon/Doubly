package com.fitto.mood.repository;

import com.fitto.mood.domain.MoodStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 삭제(탈퇴·기록 완전 삭제)는 여기 두지 않는다 — {@code RelationRecordPurger} 가
 * 관계 단위 삭제의 단일 출처다(원시 SQL로 자식→부모 순서를 관리). 이 리포지토리에
 * 삭제 메서드를 따로 두면 그쪽과 어긋나기 쉽다(ChatMessageRepository.deleteAllByUserRelations
 * 가 실제로 아무 데서도 호출되지 않는 것과 같은 함정).
 */
public interface MoodStatusRepository extends JpaRepository<MoodStatus, Long> {

    /** 관계 내 특정 사용자의 최신 무드 — "지금 상태" 조회에 쓴다. */
    Optional<MoodStatus> findTopByCoupleIdAndUserIdOrderByCreatedAtDescIdDesc(Long coupleId, Long userId);

    /**
     * 관계의 무드를 기간으로 — 무드 달력용, 시간순. {@code [from, to)} 는 저장 TZ 벽시계 값이다
     * (MoodCalendarService 가 KST 날짜에서 옮겨 준다). (couple_id, user_id, created_at) 인덱스의
     * 첫 열로 관계를 좁힌다.
     */
    List<MoodStatus> findByCoupleIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAscIdAsc(
            Long coupleId, LocalDateTime from, LocalDateTime to);
}
