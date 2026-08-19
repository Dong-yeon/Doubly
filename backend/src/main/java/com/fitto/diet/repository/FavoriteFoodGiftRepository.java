package com.fitto.diet.repository;

import com.fitto.diet.domain.FavoriteFoodGift;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FavoriteFoodGiftRepository extends JpaRepository<FavoriteFoodGift, Long> {

    /** 내가 받은 선물 — 최근 순 */
    List<FavoriteFoodGift> findByReceiverIdOrderByIdDesc(Long receiverId, Pageable pageable);

    /** 내가 보낸 선물 — 최근 순 */
    List<FavoriteFoodGift> findBySenderIdOrderByIdDesc(Long senderId, Pageable pageable);

    /** 받는 사람 본인만 수락/거절할 수 있도록 */
    Optional<FavoriteFoodGift> findByIdAndReceiverId(Long id, Long receiverId);
}
