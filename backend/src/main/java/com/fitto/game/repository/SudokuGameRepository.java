package com.fitto.game.repository;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.SudokuGame;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** 스도쿠 판 — 단일 테이블 상속이라 쿼리에 game_type 조건이 자동으로 붙는다. */
public interface SudokuGameRepository extends JpaRepository<SudokuGame, Long> {

    Optional<SudokuGame> findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(Long coupleId, GameStatus status);

    /** 기록 화면 — 연달아 끝난 판은 completed_at 이 같을 수 있어(시계가 ~1ms 단위) id 로 동률을 가른다. */
    List<SudokuGame> findTop20ByCoupleIdAndStatusOrderByCompletedAtDescIdDesc(Long coupleId, GameStatus status);

    /**
     * 그 날의 "오늘의 판" — 접고 다시 여는 것을 허용하므로 하루에 여러 행이 나올 수 있다.
     * 최신순이라 호출자는 완료 여부만 보면 된다.
     */
    List<SudokuGame> findByCoupleIdAndDailyDateOrderByCreatedAtDesc(Long coupleId, LocalDate dailyDate);

    /** 날짜가 지난 "오늘의 판" 중 아직 진행 중인 것 — 그날이 지나면 정리한다(GameExpiryService) */
    List<SudokuGame> findByStatusAndDailyDateBefore(GameStatus status, LocalDate date);

    /**
     * 행 잠금 재조회 (SELECT ... FOR UPDATE) — 칸 입력 직렬화용.
     * 둘이 동시에 다른 칸을 쓰면 board 문자열 전체를 덮어써 한쪽 입력이 사라진다(lost update).
     * H2·PostgreSQL 모두 지원한다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from SudokuGame g where g.id = :id")
    Optional<SudokuGame> findByIdForUpdate(@Param("id") Long id);
}
