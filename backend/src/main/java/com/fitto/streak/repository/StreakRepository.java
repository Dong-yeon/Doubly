package com.fitto.streak.repository;

import com.fitto.streak.domain.Streak;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StreakRepository extends JpaRepository<Streak, Long> {

    Optional<Streak> findByUserIdAndStreakType(Long userId, com.fitto.streak.domain.StreakType type);

    /**
     * 21시 스트릭 위기 리마인드 대상 — 최소 minCount 일 이상 연속 중인데 마지막 기록이
     * 어제인(=오늘 아직 기록 안 함) 개인 스트릭. last_workout_date = 어제 하나로 "살아있는
     * 스트릭"과 "오늘 미기록"이 동시에 만족된다({@link Streak#liveCount} 판정과 동일 원리).
     */
    @Query("""
            select s from Streak s
            where s.streakType = :type
              and s.userId is not null
              and s.currentCount >= :minCount
              and s.lastWorkoutDate = :yesterday
            """)
    List<Streak> findAtRiskPersonalStreaks(@Param("type") com.fitto.streak.domain.StreakType type,
                                           @Param("minCount") int minCount,
                                           @Param("yesterday") LocalDate yesterday);

    Optional<Streak> findByRelationIdAndStreakType(Long relationId, com.fitto.streak.domain.StreakType type);

    @Modifying
    @Query("delete from Streak s where s.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("""
            delete from Streak s where s.relationId in
              (select r.id from Relation r where r.userAId = :userId or r.userBId = :userId)
            """)
    void deleteAllByUserRelations(@Param("userId") Long userId);
}
