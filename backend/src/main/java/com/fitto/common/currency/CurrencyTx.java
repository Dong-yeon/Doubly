package com.fitto.common.currency;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Store;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재화의 트랜잭션 단위 — 지갑 UPDATE 와 원장 INSERT 를 <b>한 트랜잭션</b>에 묶는다.
 *
 * <p>{@link CurrencyService} 와 나눈 이유: 같은 키로 두 번 들어오면 원장 UNIQUE 위반이 나고 그 트랜잭션은 통째로
 * 되돌아가야 한다(이미 뺀 잔액까지). 그 예외를 "이미 처리됨"으로 바꾸는 일은 <b>트랜잭션 밖</b>에서만 할 수 있다 —
 * 같은 빈 안에서 부르면 프록시를 타지 않아 트랜잭션이 갈리지 않는다.
 *
 * <p>전부 {@code REQUIRES_NEW} — 부르는 쪽이 읽기 전용 트랜잭션이어도(우리 이모지 서비스의 클래스 기본값) 합류해
 * flush 되지 않는 일이 없게 한다(2026-10-13 feature_credits 에서 실제로 난 일).
 */
@Component
class CurrencyTx {

    private final CurrencyWalletRepository walletRepository;
    private final CurrencyLedgerRepository ledgerRepository;
    private final CurrencyStorePurchaseRepository purchaseRepository;

    CurrencyTx(CurrencyWalletRepository walletRepository, CurrencyLedgerRepository ledgerRepository,
               CurrencyStorePurchaseRepository purchaseRepository) {
        this.walletRepository = walletRepository;
        this.ledgerRepository = ledgerRepository;
        this.purchaseRepository = purchaseRepository;
    }

    /** 지갑 행을 만든다 — 동시에 둘이 만들면 한쪽이 PK 위반으로 실패하고, 바깥에서 "이미 있음"으로 삼킨다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createWalletIfAbsent(Long userId) {
        walletRepository.createIfAbsent(userId);
    }

    /** 충전 — 구매 행 + 원장 + 잔액. 같은 거래가 다시 오면 구매 행 UNIQUE 위반으로 통째로 되돌아간다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void grant(Long userId, Store store, String productId, String transactionId, long amount) {
        CurrencyStorePurchase purchase = purchaseRepository.saveAndFlush(CurrencyStorePurchase.builder()
                .userId(userId).store(store).productId(productId).transactionId(transactionId).amount(amount).build());
        ledgerRepository.saveAndFlush(CurrencyLedgerEntry.builder()
                .userId(userId).entryType(CurrencyLedgerEntry.Type.PURCHASE).paidDelta(amount)
                .refType("STORE_PURCHASE").refId(String.valueOf(purchase.getId()))
                .idempotencyKey("purchase:" + store.name() + ":" + transactionId)
                .build());
        walletRepository.addPaid(userId, amount);
    }

    /** 지출 — 모자라면 {@code CURRENCY_INSUFFICIENT}. 같은 키가 다시 오면 원장 UNIQUE 위반으로 뺀 것까지 되돌아간다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void spend(Long userId, long amount, String refType, String refId, String key) {
        if (walletRepository.spendPaid(userId, amount) == 0) {
            throw new BusinessException(ErrorCode.CURRENCY_INSUFFICIENT);
        }
        ledgerRepository.saveAndFlush(CurrencyLedgerEntry.builder()
                .userId(userId).entryType(CurrencyLedgerEntry.Type.SPEND).paidDelta(-amount)
                .refType(refType).refId(refId).idempotencyKey(key).build());
    }

    /** 돌려준다(지출의 되돌림) — 같은 키는 한 번만. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void refund(Long userId, long amount, String refType, String refId, String key) {
        ledgerRepository.saveAndFlush(CurrencyLedgerEntry.builder()
                .userId(userId).entryType(CurrencyLedgerEntry.Type.REFUND).paidDelta(amount)
                .refType(refType).refId(refId).idempotencyKey(key).build());
        walletRepository.addPaid(userId, amount);
    }

    /**
     * 스토어 환불 회수 — 구매 행을 잠그고 REVOKED 로, 그 양만큼 뺀다. <b>잔액이 모자라도 뺀다(음수, 결정 §10-2)</b> —
     * 이미 쓴 재화는 빚이 되고 다음 충전에서 상계된다. 회수했으면 {@code true}, 없거나 이미 회수했으면 {@code false}.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean revoke(String transactionId) {
        CurrencyStorePurchase purchase = purchaseRepository.lockByTransactionId(transactionId).orElse(null);
        if (purchase == null || !purchase.markRevoked()) {
            return false;
        }
        ledgerRepository.saveAndFlush(CurrencyLedgerEntry.builder()
                .userId(purchase.getUserId()).entryType(CurrencyLedgerEntry.Type.REVOKE).paidDelta(-purchase.getAmount())
                .refType("STORE_PURCHASE").refId(String.valueOf(purchase.getId()))
                .idempotencyKey("revoke:" + purchase.getStore().name() + ":" + transactionId)
                .build());
        walletRepository.deductPaid(purchase.getUserId(), purchase.getAmount());
        return true;
    }
}
