package com.fitto.game.repository;

import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.GameType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CoupleGameRepository extends JpaRepository<CoupleGame, Long> {

    Optional<CoupleGame> findFirstByCoupleIdAndGameTypeAndStatusOrderByCreatedAtDesc(
            Long coupleId, GameType gameType, GameStatus status);

    List<CoupleGame> findTop20ByCoupleIdAndGameTypeAndStatusOrderByCompletedAtDesc(
            Long coupleId, GameType gameType, GameStatus status);

    /**
     * 행 잠금 재조회 (SELECT ... FOR UPDATE) — 칸 입력 직렬화용.
     * 둘이 동시에 다른 칸을 쓰면 board 문자열 전체를 덮어써 한쪽 입력이 사라진다(lost update).
     * H2·PostgreSQL 모두 지원한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from CoupleGame g where g.id = :id")
    Optional<CoupleGame> findByIdForUpdate(@Param("id") Long id);
}
