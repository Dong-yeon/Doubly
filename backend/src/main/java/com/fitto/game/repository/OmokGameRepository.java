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

    /** 기록 화면 — 연달아 끝난 판은 completed_at 이 같을 수 있어(시계가 ~1ms 단위) id 로 동률을 가른다. */
    List<OmokGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDescIdDesc(Long coupleId, GameStatus status);

    /*
     * 전적 — 이 커플이 끝낸 판 <b>전부</b>를 센다(기록 화면의 최근 20판이 아니라). docs/game-current-state.md 8-1 #9.
     * 승자는 '1'(판을 연 사람)/'2'(상대)로 적혀 있으므로, 보는 사람이 그 판을 열었는지에 따라 내 것이 갈린다.
     */
    @Query("""
            select count(g) from OmokGame g
            where g.coupleId = :coupleId and g.status = :status
              and ((g.createdBy = :userId and g.winner = '1') or (g.createdBy <> :userId and g.winner = '2'))
            """)
    long countWins(@Param("coupleId") Long coupleId, @Param("userId") Long userId, @Param("status") GameStatus status);

    @Query("""
            select count(g) from OmokGame g
            where g.coupleId = :coupleId and g.status = :status
              and ((g.createdBy = :userId and g.winner = '2') or (g.createdBy <> :userId and g.winner = '1'))
            """)
    long countLosses(@Param("coupleId") Long coupleId, @Param("userId") Long userId, @Param("status") GameStatus status);

    @Query("select count(g) from OmokGame g where g.coupleId = :coupleId and g.status = :status and g.winner = 'DRAW'")
    long countDraws(@Param("coupleId") Long coupleId, @Param("status") GameStatus status);

    /** 행 잠금 재조회 — 차례 검사와 착수를 직렬화한다(둘이 동시에 두면 한쪽은 "차례 아님"). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from OmokGame g where g.id = :id")
    Optional<OmokGame> findByIdForUpdate(@Param("id") Long id);
}
