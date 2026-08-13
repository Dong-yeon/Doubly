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

import java.time.LocalDateTime;

/**
 * 구독 — 한 사용자의 유료 플랜 보유 이력.
 *
 * <p>구독은 <b>사용자</b>에 붙는다. 관계(relations)에 붙이지 않는 이유는 관계가 끊기고
 * 다시 생기기 때문이다 — 헤어졌다 재회하면 새 관계 행이 만들어지는데, 거기에 구독이
 * 묶여 있으면 결제한 사람이 자기 구독을 잃는다. 커플 등급은 조회 시점에
 * {@link PlanResolver#resolveForRelation} 이 <b>두 사람 중 높은 쪽</b>으로 해석한다.
 */
@Entity
@Table(name = "subscriptions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Subscription extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Plan plan;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SubscriptionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Store store;

    @Column(name = "product_id", nullable = false, length = 100)
    private String productId;

    /** 스토어 거래 식별자 — 웹훅 재전송에도 행이 늘지 않도록 UNIQUE. */
    @Column(name = "purchase_token", nullable = false, length = 255)
    private String purchaseToken;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    /** NULL = 만료 없음 (수동 부여) */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "auto_renew", nullable = false)
    private boolean autoRenew = true;

    @Builder
    private Subscription(Long userId, Plan plan, SubscriptionStatus status, Store store,
                         String productId, String purchaseToken,
                         LocalDateTime startedAt, LocalDateTime expiresAt, Boolean autoRenew) {
        this.userId = userId;
        this.plan = plan != null ? plan : Plan.PRO;
        this.status = status != null ? status : SubscriptionStatus.ACTIVE;
        this.store = store;
        this.productId = productId;
        this.purchaseToken = purchaseToken;
        this.startedAt = startedAt != null ? startedAt : LocalDateTime.now();
        this.expiresAt = expiresAt;
        this.autoRenew = autoRenew == null || autoRenew;
    }

    /**
     * 지금 유효한가.
     *
     * <p>상태만 보지 않고 만료 시각도 함께 본다 — 스토어 웹훅은 지연되거나 유실되므로
     * {@code ACTIVE} 인 채로 기간만 지난 행이 남을 수 있다.
     */
    public boolean isEffectiveAt(LocalDateTime now) {
        if (status != SubscriptionStatus.ACTIVE) {
            return false;
        }
        return expiresAt == null || expiresAt.isAfter(now);
    }

    /** 스토어 갱신 반영 — 같은 거래(purchaseToken)의 기간·상태만 갱신한다. */
    public void renew(LocalDateTime expiresAt, boolean autoRenew) {
        this.status = SubscriptionStatus.ACTIVE;
        this.expiresAt = expiresAt;
        this.autoRenew = autoRenew;
    }

    public void expire() {
        this.status = SubscriptionStatus.EXPIRED;
        this.autoRenew = false;
    }

    public void refund() {
        this.status = SubscriptionStatus.REFUNDED;
        this.autoRenew = false;
    }
}
