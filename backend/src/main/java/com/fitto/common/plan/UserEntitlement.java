package com.fitto.common.plan;

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
 * 소유권 한 건(V142) — "이 사람은 이것을 영구히 가졌다". 첫 소유권은 {@link Kind#AD_FREE}(Dubly Plus 영구).
 *
 * <p>{@link Plan} 과 섞지 않는다: 영구권이 {@code Plan.PRO} 가 되면 PRO 한도(원가가 붙는 기능)까지 영구로 딸려 온다
 * (docs/MONETIZATION_LIFETIME_2026-10-13.md §2). {@code transactionId} UNIQUE 로 검증 재호출·복원·웹훅 재전송이 멱등이다.
 */
@Entity
@Table(name = "user_entitlements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserEntitlement {

    /** 무엇을 가졌나. */
    public enum Kind { AD_FREE }

    public enum Status { GRANTED, REVOKED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Kind entitlement;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Store store;

    @Column(name = "product_id", nullable = false, length = 100)
    private String productId;

    @Column(name = "transaction_id", nullable = false, length = 255, unique = true)
    private String transactionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Builder
    private UserEntitlement(Long userId, Kind entitlement, Store store, String productId, String transactionId) {
        this.userId = userId;
        this.entitlement = entitlement;
        this.store = store;
        this.productId = productId;
        this.transactionId = transactionId;
        this.status = Status.GRANTED;
    }
}
