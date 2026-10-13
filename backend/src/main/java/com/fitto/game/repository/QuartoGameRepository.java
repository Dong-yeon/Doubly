package com.fitto.game.repository;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.QuartoGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 넷이 같아 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface QuartoGameRepository extends JpaRepository<QuartoGame, Long> {

    Optional<QuartoGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    /** 기록 화면 — 연달아 끝난 판은 completed_at 이 같을 수 있어 id 로 동률을 가른다(길막기와 같다) */
    List<QuartoGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDescIdDesc(Long coupleId, GameStatus status);

    /*
     * 전적 — 끝낸 판 전부. 승자는 '1'(판을 연 사람)/'2'(상대)로 적혀 있으니 보는 사람이 판을 열었는지로 가른다.
     * 승자가 비어 있는 끝난 판이 무승부다.
     */
    @Query("""
            select count(g) from QuartoGame g
            where g.coupleId = :coupleId and g.status = :status
              and ((g.createdBy = :userId and g.winnerSide = '1') or (g.createdBy <> :userId and g.winnerSide = '2'))
            """)
    long countWins(@Param("coupleId") Long coupleId, @Param("userId") Long userId, @Param("status") GameStatus status);

    @Query("""
            select count(g) from QuartoGame g
            where g.coupleId = :coupleId and g.status = :status
              and ((g.createdBy = :userId and g.winnerSide = '2') or (g.createdBy <> :userId and g.winnerSide = '1'))
            """)
    long countLosses(@Param("coupleId") Long coupleId, @Param("userId") Long userId, @Param("status") GameStatus status);

    @Query("""
            select count(g) from QuartoGame g
            where g.coupleId = :coupleId and g.status = :status and g.winnerSide is null
            """)
    long countDraws(@Param("coupleId") Long coupleId, @Param("status") GameStatus status);

    /**
     * 판의 커플 id 만 — 구성원인지 먼저 가를 때 쓴다. <b>엔티티를 읽지 않는 것이 요점이다</b>: 여기서 판을
     * 영속성 컨텍스트에 올려 두면 뒤이은 {@link #findByIdForUpdate} 가 잠금은 걸어도 그 낡은 상태를 그대로
     * 돌려줘서, 동시에 온 두 번째 수가 "아직 내 차례"로 보인다.
     */
    @Query("select g.coupleId from QuartoGame g where g.id = :id")
    Optional<Long> findCoupleIdById(@Param("id") Long id);

    /** 행 잠금 재조회 — 차례 검사와 착수를 직렬화한다(둘이 동시에 두면 한쪽은 "차례 아님"). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from QuartoGame g where g.id = :id")
    Optional<QuartoGame> findByIdForUpdate(@Param("id") Long id);
}
