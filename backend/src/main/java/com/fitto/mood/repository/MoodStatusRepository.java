package com.fitto.mood.repository;

import com.fitto.mood.domain.MoodStatus;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
