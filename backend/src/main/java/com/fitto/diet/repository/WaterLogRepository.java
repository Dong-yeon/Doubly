package com.fitto.diet.repository;

import com.fitto.diet.domain.WaterLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface WaterLogRepository extends JpaRepository<WaterLog, Long> {

    Optional<WaterLog> findByUserIdAndLogDate(Long userId, LocalDate logDate);

    /**
     * 그날 행에 delta 를 <b>한 문장으로</b> 더한다(0 아래로는 안 내려감). 읽고-더하고-쓰면 동시에 온 두 요청이 같은 값을
     * 읽어 하나가 조용히 사라진다 — UPDATE 는 행 잠금을 잡고 현재 값에 더하므로 그런 일이 없다.
     * GREATEST 대신 CASE 를 쓴 건 JPQL 표준이라 H2·PostgreSQL 어디서나 같은 뜻이어서다.
     *
     * @return 바뀐 행 수 — 0 이면 그날 행이 아직 없다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE WaterLog w SET w.amountMl = CASE WHEN w.amountMl + :delta < 0 THEN 0 ELSE w.amountMl + :delta END, "
            + "w.updatedAt = :now WHERE w.userId = :userId AND w.logDate = :logDate")
    int addAmount(@Param("userId") Long userId, @Param("logDate") LocalDate logDate,
                  @Param("delta") int delta, @Param("now") LocalDateTime now);

    /** 물·단식 리포트 — 기간 안의 날짜별 누적 */
    List<WaterLog> findByUserIdAndLogDateBetween(Long userId, LocalDate start, LocalDate end);
}
