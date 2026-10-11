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

    /** 기록 화면 — 연달아 끝난 판은 completed_at 이 같을 수 있어(시계가 ~1ms 단위) id 로 동률을 가른다. */
    List<PuzzleBattleGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDescIdDesc(Long coupleId, GameStatus status);

    /**
     * 핸디캡 계산용 — 최근 끝난 판부터. completed_at 이 아니라 id 로 센다: 시계는 1ms 안팎으로만
     * 움직여 연달아 끝난 두 판이 같은 시각을 갖고, 그러면 순서가 정해지지 않는다. 진행 중인 판은
     * 커플당 하나뿐이라(start 가 관계 행을 잠근다) id 순서가 곧 끝난 순서다.
     */
    List<PuzzleBattleGame> findTop20ByCoupleIdAndStatusOrderByIdDesc(Long coupleId, GameStatus status);

    /**
     * 행 잠금 재조회 — 결과 제출을 직렬화한다.
     * 둘이 동시에 결과를 내면 "상대가 냈는가" 판정이 서로를 못 보고 판이 안 끝난다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from PuzzleBattleGame g where g.id = :id")
    Optional<PuzzleBattleGame> findByIdForUpdate(@Param("id") Long id);
}
