package com.fitto.common.currency;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CurrencyLedgerRepository extends JpaRepository<CurrencyLedgerEntry, Long> {

    boolean existsByIdempotencyKey(String idempotencyKey);
}
