package com.fitto.workout.repository;

import com.fitto.workout.domain.RoutineGift;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoutineGiftRepository extends JpaRepository<RoutineGift, Long> {

    /** 내가 받은 선물 — 최근 순 */
    List<RoutineGift> findByReceiverIdOrderByIdDesc(Long receiverId, Pageable pageable);

    /** 내가 보낸 선물 — 최근 순 */
    List<RoutineGift> findBySenderIdOrderByIdDesc(Long senderId, Pageable pageable);

    /** 받는 사람 본인만 수락/거절할 수 있도록 */
    Optional<RoutineGift> findByIdAndReceiverId(Long id, Long receiverId);
}
