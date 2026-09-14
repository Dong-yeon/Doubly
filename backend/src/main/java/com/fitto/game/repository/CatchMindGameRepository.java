package com.fitto.game.repository;

import com.fitto.game.domain.CatchMindGame;
import com.fitto.game.domain.GameStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 캐치마인드 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface CatchMindGameRepository extends JpaRepository<CatchMindGame, Long> {

    Optional<CatchMindGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    List<CatchMindGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(Long coupleId, GameStatus status);

    /**
     * 행 잠금 재조회 — 정답 시도를 직렬화한다.
     * 둘이 동시에 답을 넣으면 guess_count·wrong_guesses 가 서로를 덮어쓴다(lost update).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from CatchMindGame g where g.id = :id")
    Optional<CatchMindGame> findByIdForUpdate(@Param("id") Long id);
}
