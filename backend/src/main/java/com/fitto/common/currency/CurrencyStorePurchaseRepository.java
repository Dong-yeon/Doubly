package com.fitto.common.currency;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CurrencyStorePurchaseRepository extends JpaRepository<CurrencyStorePurchase, Long> {

    Optional<CurrencyStorePurchase> findByTransactionId(String transactionId);

    /** 회수할 때 — 웹훅이 두 번 와도 한 번만 회수하게 행을 잠근다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from CurrencyStorePurchase p where p.transactionId = :tx")
    Optional<CurrencyStorePurchase> lockByTransactionId(@Param("tx") String transactionId);
}
