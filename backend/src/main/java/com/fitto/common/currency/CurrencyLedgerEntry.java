package com.fitto.common.currency;

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

/**
 * 재화 원장 한 줄 — append-only(V140). 잔액은 지갑이 들고, 여기는 "왜"를 남긴다.
 * {@code idempotencyKey} UNIQUE 가 같은 결제·지출·환불의 이중 반영을 DB 로 막는다.
 */
@Entity
@Table(name = "currency_ledger")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CurrencyLedgerEntry {

    public enum Type { PURCHASE, SPEND, REFUND, REVOKE, GRANT, MIGRATION }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 20)
    private Type entryType;

    /** 부호 있는 변화량 — 지출·회수는 음수. */
    @Column(name = "paid_delta", nullable = false)
    private long paidDelta;

    @Column(name = "free_delta", nullable = false)
    private long freeDelta;

    @Column(name = "ref_type", length = 30)
    private String refType;

    @Column(name = "ref_id", length = 255)
    private String refId;

    @Column(name = "idempotency_key", nullable = false, length = 255, unique = true)
    private String idempotencyKey;

    @Builder
    private CurrencyLedgerEntry(Long userId, Type entryType, long paidDelta, String refType, String refId,
                                String idempotencyKey) {
        this.userId = userId;
        this.entryType = entryType;
        this.paidDelta = paidDelta;
        this.freeDelta = 0;
        this.refType = refType;
        this.refId = refId;
        this.idempotencyKey = idempotencyKey;
    }
}
