package com.fitto.game.repository;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.WallRaceGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 길막기 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface WallRaceGameRepository extends JpaRepository<WallRaceGame, Long> {

    Optional<WallRaceGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    /** 기록 화면 — 연달아 끝난 판은 completed_at 이 같을 수 있어(시계가 ~1ms 단위) id 로 동률을 가른다. */
    List<WallRaceGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDescIdDesc(Long coupleId, GameStatus status);

    /**
     * 핸디캡 계산용 — 최근 끝난 판부터. 연패를 세는 데만 쓴다. completed_at 은 연달아 끝난 판끼리
     * 같은 값이 나와 순서가 흔들리므로 id 로 센다(진행 중인 판은 커플당 하나라 id 순서 = 끝난 순서).
     */
    List<WallRaceGame> findTop5ByCoupleIdAndStatusOrderByIdDesc(Long coupleId, GameStatus status);

    /** 행 잠금 재조회 — 차례 검사와 착수를 직렬화한다(둘이 동시에 두면 한쪽은 "차례 아님"). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from WallRaceGame g where g.id = :id")
    Optional<WallRaceGame> findByIdForUpdate(@Param("id") Long id);
}
