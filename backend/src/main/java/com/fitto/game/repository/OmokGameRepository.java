package com.fitto.game.repository;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.OmokGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 오목 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface OmokGameRepository extends JpaRepository<OmokGame, Long> {

    Optional<OmokGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    List<OmokGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(Long coupleId, GameStatus status);

    /** 행 잠금 재조회 — 차례 검사와 착수를 직렬화한다(둘이 동시에 두면 한쪽은 "차례 아님"). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from OmokGame g where g.id = :id")
    Optional<OmokGame> findByIdForUpdate(@Param("id") Long id);
}
