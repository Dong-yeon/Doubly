package com.fitto.game.repository;

import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 종목을 가리지 않는 조회 — 상속 루트({@link CoupleGame})라 스도쿠·오목이 함께 잡힌다.
 * 종목별 규칙이 들어가는 쿼리는 {@link SudokuGameRepository}·{@link OmokGameRepository} 쪽이다.
 */
public interface CoupleGameRepository extends JpaRepository<CoupleGame, Long> {

    /**
     * 스트릭 계산용 — 끝낸 판의 완료 시각만 가져온다.
     *
     * <p>판 전체를 읽지 않는 이유: 스도쿠 행은 81자 문자열이 넷이라 1년치를 통째로 읽으면
     * 날짜 목록 하나 만들자고 수백 KB 를 끌어온다.
     */
    @Query("""
            select g.completedAt from CoupleGame g
            where g.coupleId = :coupleId and g.status = :status and g.completedAt >= :since
            """)
    List<LocalDateTime> findCompletedAtSince(@Param("coupleId") Long coupleId,
                                             @Param("status") GameStatus status,
                                             @Param("since") LocalDateTime since);
}
