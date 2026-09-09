package com.fitto.game.repository;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.SudokuGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 스도쿠 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface SudokuGameRepository extends JpaRepository<SudokuGame, Long> {

    Optional<SudokuGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    List<SudokuGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(Long coupleId, GameStatus status);

    /**
     * 행 잠금 재조회 (SELECT ... FOR UPDATE) — 칸 입력 직렬화용.
     * 둘이 동시에 다른 칸을 쓰면 board 문자열 전체를 덮어써 한쪽 입력이 사라진다(lost update).
     * H2·PostgreSQL 모두 지원한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from SudokuGame g where g.id = :id")
    Optional<SudokuGame> findByIdForUpdate(@Param("id") Long id);
}
