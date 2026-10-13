package com.fitto.common.currency;

import com.fitto.common.plan.Store;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 재화 묶음 스토어 구매 한 건(V140) — {@code transactionId} UNIQUE 로 검증 재호출·웹훅 재전송이 멱등이다. */
@Entity
@Table(name = "currency_store_purchases")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CurrencyStorePurchase {

    public enum Status { GRANTED, REVOKED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Store store;

    @Column(name = "product_id", nullable = false, length = 100)
    private String productId;

    @Column(name = "transaction_id", nullable = false, length = 255, unique = true)
    private String transactionId;

    @Column(nullable = false)
    private long amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Builder
    private CurrencyStorePurchase(Long userId, Store store, String productId, String transactionId, long amount) {
        this.userId = userId;
        this.store = store;
        this.productId = productId;
        this.transactionId = transactionId;
        this.amount = amount;
        this.status = Status.GRANTED;
    }

    /** 환불됐다 — 처음 바꾸면 {@code true}(이미 회수했으면 {@code false}). */
    boolean markRevoked() {
        if (status == Status.REVOKED) {
            return false;
        }
        status = Status.REVOKED;
        return true;
    }
}
