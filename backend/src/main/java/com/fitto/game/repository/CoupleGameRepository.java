package com.fitto.game.repository;

import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    /*
     * 재촉·리마인더 시각 — 벌크 update 라 감사(@LastModifiedDate)가 돌지 않아 updated_at 이 그대로다.
     * updated_at 이 바뀌면 GameQuiet(차례 알림)와 멈춘 판 판정이 둘 다 틀어진다(V108 주석).
     */
    @Modifying(clearAutomatically = true)
    @Query("update CoupleGame g set g.nudgedByCreatorAt = :at where g.id = :id")
    int markNudgedByCreator(@Param("id") Long id, @Param("at") LocalDateTime at);

    @Modifying(clearAutomatically = true)
    @Query("update CoupleGame g set g.nudgedByPartnerAt = :at where g.id = :id")
    int markNudgedByPartner(@Param("id") Long id, @Param("at") LocalDateTime at);

    @Modifying(clearAutomatically = true)
    @Query("update CoupleGame g set g.remindedAt = :at where g.id = :id")
    int markReminded(@Param("id") Long id, @Param("at") LocalDateTime at);

    /**
     * 멈춘 판 — 진행 중인데 {@code before} 전부터 움직임이 없고, 이번 멈춤에는 아직 알리지 않은 판.
     * 리마인더를 보낸 뒤 판이 다시 움직이면 updated_at 이 reminded_at 을 앞질러 다음 멈춤에 또 알린다.
     */
    @Query("""
            select g from CoupleGame g
            where g.status = :status and g.updatedAt < :before
              and (g.remindedAt is null or g.remindedAt < g.updatedAt)
            """)
    List<CoupleGame> findStalled(@Param("status") GameStatus status, @Param("before") LocalDateTime before);
}
