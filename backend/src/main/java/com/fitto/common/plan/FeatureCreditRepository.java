package com.fitto.common.plan;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FeatureCreditRepository extends JpaRepository<FeatureCredit, Long> {

    Optional<FeatureCredit> findByTransactionId(String transactionId);

    boolean existsByTransactionIdIn(java.util.Collection<String> transactionIds);

    /** 첫 1회 무료를 되돌릴 때 — 쓴 사람의 행과, 그 사람이 상대 몫으로 남긴 표지 행. */
    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    @Query("delete from FeatureCredit c where c.transactionId = :transactionId or c.productId = :markerProduct")
    int deleteWelcome(@Param("transactionId") String transactionId, @Param("markerProduct") String markerProduct);

    /**
     * 아직 남은 묶음 — 먼저 산 것부터 쓴다.
     *
     * <p><b>행을 잠근다.</b> 차감은 읽은 뒤 메모리에서 {@code used++} 하고 더티 체킹으로 쓴다
     * ({@link FeatureCredit#consumeOne}). 잠금이 없으면 남은 1회를 두 요청이 동시에 읽고 둘 다 {@code used=1} 로
     * 써서 크레딧 하나로 두 세트가 나갔다(lost update — docs/EMOJI_12_REGEN_2026-10-13.md §1-3). 뒤 요청은 앞
     * 트랜잭션이 끝날 때까지 기다렸다가 갱신된 행을 다시 본다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from FeatureCredit c where c.userId = :userId and c.feature = :feature"
            + " and c.used < c.credits order by c.id asc")
    List<FeatureCredit> findAvailable(@Param("userId") Long userId, @Param("feature") Feature feature);

    /** 쓴 적이 있는 묶음 — 되돌릴 때는 가장 최근 것부터. 차감과 같은 이유로 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from FeatureCredit c where c.userId = :userId and c.feature = :feature"
            + " and c.used > 0 order by c.id desc")
    List<FeatureCredit> findConsumed(@Param("userId") Long userId, @Param("feature") Feature feature);

    @Query("select coalesce(sum(c.credits - c.used), 0) from FeatureCredit c"
            + " where c.userId = :userId and c.feature = :feature and c.used < c.credits")
    long sumRemaining(@Param("userId") Long userId, @Param("feature") Feature feature);
}
