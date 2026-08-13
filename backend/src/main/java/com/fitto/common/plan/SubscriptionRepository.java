package com.fitto.common.plan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    /** 스토어 웹훅 멱등 처리용 — 같은 거래는 새로 만들지 않고 갱신한다. */
    Optional<Subscription> findByPurchaseToken(String purchaseToken);

    /**
     * 지금 유효한 구독들.
     *
     * <p>여러 사용자를 한 번에 묻는 형태다 — 커플 등급 판정이 두 사람을 동시에 보기 때문에,
     * 사용자마다 따로 질의하면 관계 조회 한 번에 쿼리가 N개씩 붙는다.
     */
    @Query("""
            select s from Subscription s
            where s.userId in :userIds
              and s.status = com.fitto.common.plan.SubscriptionStatus.ACTIVE
              and (s.expiresAt is null or s.expiresAt > :now)
            """)
    List<Subscription> findEffective(@Param("userIds") List<Long> userIds,
                                     @Param("now") LocalDateTime now);
}
