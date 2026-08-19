package com.fitto.diet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 즐겨찾기 선물에 담긴 음식 스냅샷 한 줄 — {@link FavoriteFoodItem} 구조를 그대로 미러링하되
 * 소유가 {@link FavoriteFoodGift} 다. 전송 시점에 값을 복제해두므로 원본 즐겨찾기가 그 뒤
 * 수정되거나 삭제돼도 선물 내용은 바뀌지 않는다.
 */
@Entity
@Table(name = "favorite_food_gift_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FavoriteFoodGiftItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gift_id", nullable = false)
    private FavoriteFoodGift gift;

    @Column(nullable = false, length = 100)
    private String name;

    private Integer calories;
    private Integer carbs;
    private Integer protein;
    private Integer fat;

    @Column(name = "order_no", nullable = false)
    private Integer orderNo;

    @Builder
    private FavoriteFoodGiftItem(String name, Integer calories, Integer carbs, Integer protein,
                                 Integer fat, Integer orderNo) {
        this.name = name;
        this.calories = calories;
        this.carbs = carbs;
        this.protein = protein;
        this.fat = fat;
        this.orderNo = orderNo != null ? orderNo : 0;
    }

    void assignTo(FavoriteFoodGift gift) {
        this.gift = gift;
    }
}
