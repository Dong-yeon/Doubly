package com.fitto.game.repository;

import com.fitto.game.domain.SpotPuzzle;
import com.fitto.game.domain.SpotPuzzleStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SpotPuzzleRepository extends JpaRepository<SpotPuzzle, Long> {

    /** 탭·힌트·열기 — 두 사람의 풀이를 이 행에서 직렬화한다 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from SpotPuzzle p where p.id = :id")
    Optional<SpotPuzzle> findByIdForUpdate(@Param("id") Long id);

    /**
     * 구성원 확인용 — 엔티티를 읽지 않는다. 잠그기 전에 엔티티를 영속성 컨텍스트에 올리면 잠금 조회가
     * 그 낡은 객체를 돌려준다(QuartoGameRepository.findCoupleIdById 와 같은 이유).
     */
    @Query("select p.coupleId from SpotPuzzle p where p.id = :id")
    Optional<Long> findCoupleIdById(@Param("id") Long id);

    Optional<SpotPuzzle> findByCoupleIdAndPuzzleDate(Long coupleId, LocalDate puzzleDate);

    /** 목록 — 최근 것부터. 열린 판은 48시간짜리라 몇 개 안 된다 */
    List<SpotPuzzle> findTop10ByCoupleIdOrderByCreatedAtDescIdDesc(Long coupleId);

    /** 지난 결과 — 둘 다 끝냈거나 만료된 판 */
    @Query("""
            select p from SpotPuzzle p
            where p.coupleId = :coupleId
              and (p.completedAt is not null
                   or (p.status = com.fitto.game.domain.SpotPuzzleStatus.EXPIRED and p.layoutJson is not null))
            order by p.createdAt desc, p.id desc
            """)
    List<SpotPuzzle> findHistory(@Param("coupleId") Long coupleId,
                                 org.springframework.data.domain.Pageable pageable);

    /** 시간 만료 대상 — 아직 열려 있는데 수명이 지난 판 */
    List<SpotPuzzle> findByStatusInAndExpiresAtBefore(Collection<SpotPuzzleStatus> statuses, LocalDateTime now);

    /**
     * 원본 확인 대상 — A/B 이미지가 아직 있는 판 전부. 끝난 판도 포함한다: 원본을 지웠으면 그 사진으로 만든
     * 이미지도 사라져야 한다(결과 화면에 남아 있으면 지운 사진이 계속 보인다).
     */
    List<SpotPuzzle> findByImageAUrlIsNotNull();

    /** 최근 퍼즐로 쓴 사진 — 다시 고르지 않는다 */
    @Query("select p.sourceUrl from SpotPuzzle p where p.coupleId = :coupleId and p.sourceUrl is not null "
            + "and p.createdAt >= :since")
    List<String> findRecentSourceUrls(@Param("coupleId") Long coupleId, @Param("since") LocalDateTime since);

    /** 게임 스트릭 — 둘 다 끝낸 시각 */
    @Query("select p.completedAt from SpotPuzzle p where p.coupleId = :coupleId and p.completedAt >= :since")
    List<LocalDateTime> findCompletedAtSince(@Param("coupleId") Long coupleId, @Param("since") LocalDateTime since);

    long countByCoupleIdAndCompletedAtIsNotNull(Long coupleId);

    /** 무제한 모드 — 아직 아무도 손대지 않은 판이 남았는가 */
    @Query("""
            select count(p) from SpotPuzzle p
            where p.coupleId = :coupleId
              and p.status in (com.fitto.game.domain.SpotPuzzleStatus.PENDING, com.fitto.game.domain.SpotPuzzleStatus.READY)
              and p.expiresAt > :now
              and not exists (select 1 from SpotPuzzlePlay pl where pl.puzzleId = p.id)
            """)
    long countUntouched(@Param("coupleId") Long coupleId, @Param("now") LocalDateTime now);
}
