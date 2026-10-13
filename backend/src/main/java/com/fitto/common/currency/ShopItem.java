package com.fitto.common.currency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 앱 안 상품 — 재화 가격(V140). 가격은 서버가 정하고 앱은 {@code GET /shop/items} 로 받아 그린다(앱 배포 없이 조정).
 */
@Entity
@Table(name = "shop_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ShopItem {

    /** 우리 이모지 한 세트 — 12장 + 다시 그리기 3번. */
    public static final String EMOJI_SET = "EMOJI_SET";

    @Id
    @Column(length = 40)
    private String id;

    @Column(name = "item_type", nullable = false, length = 20)
    private String itemType;

    @Column(nullable = false)
    private long price;

    @Column(nullable = false)
    private boolean active;
}
