package com.fitto.character.repository;

import com.fitto.character.domain.CoupleCharacter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CoupleCharacterRepository extends JpaRepository<CoupleCharacter, Long> {

    Optional<CoupleCharacter> findByRelationId(Long relationId);

    // 퇴화 배치가 순회할 대상 — 오늘 아직 처리되지 않은 행만 페이지 단위로 훑는다.
    // (CharacterDecayJob 예정 — Streak 처럼 growth 시점에 lazy 생성되므로 전체 스캔 대상은
    // "지금까지 한 번이라도 자란 커플"로 한정된다)
    @Query("select c from CoupleCharacter c where c.lastDecayedDate is null or c.lastDecayedDate < :today")
    java.util.List<CoupleCharacter> findAllPendingDecay(@Param("today") java.time.LocalDate today);

    // 계정 삭제 시 정리 — StreakRepository.deleteAllByUserRelations 와 동일한 패턴.
    @Modifying
    @Query("""
            delete from CoupleCharacter c where c.relationId in
              (select r.id from Relation r where r.userAId = :userId or r.userBId = :userId)
            """)
    void deleteAllByUserRelations(@Param("userId") Long userId);
}
