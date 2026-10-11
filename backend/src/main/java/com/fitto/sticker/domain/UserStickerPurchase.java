package com.fitto.sticker.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * "이 사람이 이 팩을 샀다" — 구독과 <b>독립된</b> 소유권.
 *
 * <p>구독이 끊겨도 이 행은 남는다. 낱개 구매는 일회성 상품(non-consumable)이라 한 번 사면
 * 영구 소유이고, 그게 구독과 나란히 파는 이유이기도 하다 — 매달 내기는 싫지만 이 팩 하나는
 * 갖고 싶은 사람에게 팔 물건이 없으면 그 사람은 아무것도 안 산다.
 *
 * <p><b>소유자는 사람이지 커플이 아니다.</b> 헤어져도 자기가 낸 돈은 자기 것으로 남는다.
 * 다만 <b>사용</b> 판정은 커플까지 퍼진다({@code StickerService} 주석) — 기존
 * {@code Feature.PREMIUM_STICKER} 가 커플 단위 판정인 것과 같은 프레임이다.
 */
@Entity
@Table(name = "user_sticker_purchases")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserStickerPurchase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "sticker_pack_id", nullable = false, length = 40)
    private String stickerPackId;

    /** 스토어 거래 id — 스토어 등록 전 수동 지급이면 null. */
    @Column(name = "transaction_id", length = 255)
    private String transactionId;

    @Column(name = "purchased_at", nullable = false)
    private LocalDateTime purchasedAt;

    @Builder
    private UserStickerPurchase(Long userId, String stickerPackId, String transactionId) {
        this.userId = userId;
        this.stickerPackId = stickerPackId;
        this.transactionId = transactionId;
        this.purchasedAt = LocalDateTime.now();
    }
}
