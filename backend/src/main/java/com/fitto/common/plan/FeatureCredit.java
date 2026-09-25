package com.fitto.common.plan;

import com.fitto.common.domain.BaseTimeEntity;
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
 * 기능 크레딧 한 묶음 — 스토어 거래 하나가 준 "N회 추가"와 그중 쓴 수.
 *
 * <p>구독({@link Subscription})처럼 <b>사용자</b>에 붙는다. 커플 기능이라도 결제한 사람의
 * 것이다 — 관계가 끊겨도 산 것은 남아야 한다.
 */
@Entity
@Table(name = "feature_credits")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FeatureCredit extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private Feature feature;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Store store;

    @Column(name = "product_id", nullable = false, length = 100)
    private String productId;

    /** 스토어 거래 식별자(Play purchaseToken / App Store transactionId) — 재검증에도 행이 늘지 않도록 UNIQUE. */
    @Column(name = "transaction_id", nullable = false, length = 255)
    private String transactionId;

    @Column(nullable = false)
    private int credits;

    @Column(nullable = false)
    private int used;

    @Builder
    private FeatureCredit(Long userId, Feature feature, Store store, String productId,
                          String transactionId, int credits) {
        this.userId = userId;
        this.feature = feature;
        this.store = store;
        this.productId = productId;
        this.transactionId = transactionId;
        this.credits = credits;
        this.used = 0;
    }

    public int remaining() {
        return Math.max(0, credits - used);
    }

    /** 한 회 쓴다 — 남은 게 없으면 {@code false}. */
    public boolean consumeOne() {
        if (remaining() <= 0) {
            return false;
        }
        used++;
        return true;
    }

    /** {@link #consumeOne} 을 되돌린다 — 쓴 적이 없으면 아무것도 하지 않는다. */
    public boolean refundOne() {
        if (used <= 0) {
            return false;
        }
        used--;
        return true;
    }
}
