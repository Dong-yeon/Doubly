package com.fitto.voice.repository;

import com.fitto.voice.domain.WorkoutBooster;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface WorkoutBoosterRepository extends JpaRepository<WorkoutBooster, Long> {

    /**
     * 내게 온 안 들은 부스터 중 <b>가장 오래된</b> 하나.
     *
     * <p>여러 개가 쌓였으면 보낸 순서대로 하나씩 소비한다 — 최신 것만 재생하고 나머지를
     * 버리면 애인이 보낸 응원이 조용히 사라진다.
     */
    Optional<WorkoutBooster> findFirstByReceiverIdAndPlayedAtIsNullOrderByIdAsc(Long receiverId);
}
