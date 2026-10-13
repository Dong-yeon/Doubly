package com.fitto.game.repository;

import com.fitto.game.domain.QuartoMove;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface QuartoMoveRepository extends JpaRepository<QuartoMove, Long> {

    /** 재전송 판별 — (game_id, client_move_id) 는 unique 다(V139) */
    Optional<QuartoMove> findByGameIdAndClientMoveId(Long gameId, String clientMoveId);

    List<QuartoMove> findByGameIdOrderByMoveNoAsc(Long gameId);

    /** 기록 화면 — 끝난 판 여러 개의 수를 한 번에 */
    List<QuartoMove> findByGameIdInOrderByGameIdAscMoveNoAsc(Collection<Long> gameIds);

    long countByGameId(Long gameId);
}
