package com.fitto.common.plan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserEntitlementRepository extends JpaRepository<UserEntitlement, Long> {

    Optional<UserEntitlement> findByTransactionId(String transactionId);

    boolean existsByTransactionId(String transactionId);

    /** 이 사람들 중 이 소유권을 (환불되지 않은 채) 가진 사람 — 커플 판정을 한 번의 질의로. */
    @Query("""
            select distinct e.userId from UserEntitlement e
             where e.userId in :userIds and e.entitlement = :kind
               and e.status = com.fitto.common.plan.UserEntitlement.Status.GRANTED
            """)
    List<Long> findOwners(@Param("userIds") Collection<Long> userIds, @Param("kind") UserEntitlement.Kind kind);

    /**
     * 환불 회수 — 조건부 UPDATE 라 웹훅이 두 번 와도 한 번만 1 을 돌려준다(행 잠금이 필요 없다).
     */
    @Transactional
    @Modifying(clearAutomatically = true)
    @Query("""
            update UserEntitlement e set e.status = com.fitto.common.plan.UserEntitlement.Status.REVOKED
             where e.transactionId = :tx and e.status = com.fitto.common.plan.UserEntitlement.Status.GRANTED
            """)
    int revoke(@Param("tx") String transactionId);
}
