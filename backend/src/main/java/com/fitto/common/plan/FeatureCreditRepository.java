package com.fitto.common.plan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FeatureCreditRepository extends JpaRepository<FeatureCredit, Long> {

    Optional<FeatureCredit> findByTransactionId(String transactionId);

    /** 아직 남은 묶음 — 먼저 산 것부터 쓴다. */
    @Query("select c from FeatureCredit c where c.userId = :userId and c.feature = :feature"
            + " and c.used < c.credits order by c.id asc")
    List<FeatureCredit> findAvailable(@Param("userId") Long userId, @Param("feature") Feature feature);

    /** 쓴 적이 있는 묶음 — 되돌릴 때는 가장 최근 것부터. */
    @Query("select c from FeatureCredit c where c.userId = :userId and c.feature = :feature"
            + " and c.used > 0 order by c.id desc")
    List<FeatureCredit> findConsumed(@Param("userId") Long userId, @Param("feature") Feature feature);

    @Query("select coalesce(sum(c.credits - c.used), 0) from FeatureCredit c"
            + " where c.userId = :userId and c.feature = :feature and c.used < c.credits")
    long sumRemaining(@Param("userId") Long userId, @Param("feature") Feature feature);
}
