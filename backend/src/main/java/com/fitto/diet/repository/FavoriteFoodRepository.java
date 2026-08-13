package com.fitto.diet.repository;

import com.fitto.diet.domain.FavoriteFood;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FavoriteFoodRepository extends JpaRepository<FavoriteFood, Long> {

    List<FavoriteFood> findByUserIdOrderByIdDesc(Long userId);

    /** 즐겨찾기 개수 — 플랜 상한 판정 */
    long countByUserId(Long userId);

    Optional<FavoriteFood> findByIdAndUserId(Long id, Long userId);

    boolean existsByUserIdAndName(Long userId, String name);
}
