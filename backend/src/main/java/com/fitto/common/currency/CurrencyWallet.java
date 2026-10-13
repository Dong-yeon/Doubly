package com.fitto.common.currency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 재화 지갑 — 사람당 한 행(V140). <b>잔액은 이 엔티티로 고치지 않는다</b> — 읽고 더해서 쓰면 동시 요청에 한 번이 두 번
 * 쓰인다. 바꾸는 길은 {@link CurrencyWalletRepository} 의 조건부 UPDATE 뿐이고, 이 엔티티는 조회용이다.
 */
@Entity
@Table(name = "currency_wallets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CurrencyWallet {

    @Id
    @Column(name = "user_id")
    private Long userId;

    /** 결제로 산 것 — 음수일 수 있다(환불 회수로 생긴 빚, V140 주석). */
    @Column(name = "paid_balance", nullable = false)
    private long paidBalance;

    @Column(name = "free_balance", nullable = false)
    private long freeBalance;
}
