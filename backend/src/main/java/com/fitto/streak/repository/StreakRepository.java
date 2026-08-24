package com.fitto.streak.repository;

import com.fitto.streak.domain.Streak;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StreakRepository extends JpaRepository<Streak, Long> {

    Optional<Streak> findByUserIdAndStreakType(Long userId, com.fitto.streak.domain.StreakType type);

    Optional<Streak> findByRelationIdAndStreakType(Long relationId, com.fitto.streak.domain.StreakType type);

    /**
     * 오늘 끊길 위기의 개인 스트릭 — 마지막 기록이 <b>어제</b>이고 일정 일수 이상 쌓인 것.
     *
     * <p>마지막 기록이 오늘이면 이미 이어간 것이고, 그저께 이하면 이미 끊긴 것이다.
     * 딱 어제인 경우만 "오늘 하면 이어지는" 상태다({@code ReengagementNotifier}).
     */
    @Query("""
            select s from Streak s
            where s.userId is not null
              and s.streakType in :types
              and s.lastWorkoutDate = :yesterday
              and s.currentCount >= :minCount
            order by s.currentCount desc
            """)
    List<Streak> findPersonalAtRisk(@Param("types") java.util.Collection<com.fitto.streak.domain.StreakType> types,
                                    @Param("yesterday") java.time.LocalDate yesterday,
                                    @Param("minCount") int minCount);

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
