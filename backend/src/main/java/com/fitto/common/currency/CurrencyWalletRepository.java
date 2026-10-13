package com.fitto.common.currency;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 지갑 잔액은 <b>조건부 UPDATE 한 줄</b>로만 바꾼다 — 동시 요청에도 한 번만 이기는 유일한 모양이다.
 * 호출자가 트랜잭션을 연다({@link CurrencyService}).
 */
public interface CurrencyWalletRepository extends JpaRepository<CurrencyWallet, Long> {

    /** 행이 없을 때만 0 으로 만든다 — 동시에 둘이 만들면 PK 위반이 나고, 호출자는 그걸 "이미 있음"으로 본다. */
    @Modifying(flushAutomatically = true)
    @Query(value = "insert into currency_wallets (user_id, paid_balance, free_balance) "
            + "select :userId, 0, 0 where not exists (select 1 from currency_wallets where user_id = :userId)",
            nativeQuery = true)
    int createIfAbsent(@Param("userId") Long userId);

    /** 넣는다(충전·환불). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CurrencyWallet w set w.paidBalance = w.paidBalance + :amount where w.userId = :userId")
    int addPaid(@Param("userId") Long userId, @Param("amount") long amount);

    /** 잔액이 충분할 때만 뺀다(지출) — 0 이면 모자란다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CurrencyWallet w set w.paidBalance = w.paidBalance - :amount"
            + " where w.userId = :userId and w.paidBalance >= :amount")
    int spendPaid(@Param("userId") Long userId, @Param("amount") long amount);

    /** 조건 없이 뺀다(환불 회수) — 음수가 될 수 있다(V140 주석). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CurrencyWallet w set w.paidBalance = w.paidBalance - :amount where w.userId = :userId")
    int deductPaid(@Param("userId") Long userId, @Param("amount") long amount);
}
