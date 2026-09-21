package com.fitto.game.repository;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.PuzzleBattleGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 연쇄 퍼즐 대전 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface PuzzleBattleGameRepository extends JpaRepository<PuzzleBattleGame, Long> {

    Optional<PuzzleBattleGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    List<PuzzleBattleGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(Long coupleId, GameStatus status);

    /**
     * 행 잠금 재조회 — 결과 제출을 직렬화한다.
     * 둘이 동시에 결과를 내면 "상대가 냈는가" 판정이 서로를 못 보고 판이 안 끝난다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from PuzzleBattleGame g where g.id = :id")
    Optional<PuzzleBattleGame> findByIdForUpdate(@Param("id") Long id);
}
