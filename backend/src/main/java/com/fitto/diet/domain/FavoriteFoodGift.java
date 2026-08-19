package com.fitto.diet.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.BatchSize;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 즐겨찾기 음식 공유 — 내 즐겨찾기 세트를 애인에게 보내 수락하면 애인 즐겨찾기 목록에
 * 그대로 추가된다. 운동 루틴 선물({@code com.fitto.workout.domain.RoutineGift})과 같은
 * 방침(전송 즉시 스냅샷, 수락 전까지 원본과 분리)이지만, 즐겨찾기엔 "시스템 템플릿" 같은
 * 주인 없는 행 개념이 없어 스냅샷 항목을 이 엔티티가 직접 들고 있다 — 별도 favorite_foods
 * 행을 만들 필요가 없다.
 */
@Entity
@Table(name = "favorite_food_gifts")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FavoriteFoodGift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    @Column(name = "receiver_id", nullable = false)
    private Long receiverId;

    /** 전송 시점 세트 라벨 스냅샷 */
    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 200)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FavoriteFoodGiftStatus status;

    /** 수락 시 receiver 소유로 새로 만들어진 즐겨찾기 id — 수락 전엔 null. */
    @Column(name = "resulting_favorite_food_id")
    private Long resultingFavoriteFoodId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "responded_at")
    private LocalDateTime respondedAt;

    @OneToMany(mappedBy = "gift", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderNo asc")
    @BatchSize(size = 30)
    private List<FavoriteFoodGiftItem> items = new ArrayList<>();

    @Builder
    private FavoriteFoodGift(Long relationId, Long senderId, Long receiverId, String name, String message) {
        this.relationId = relationId;
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.name = name;
        this.message = message;
        this.status = FavoriteFoodGiftStatus.PENDING;
    }

    public void addItem(FavoriteFoodGiftItem item) {
        items.add(item);
        item.assignTo(this);
    }

    public void accept(Long resultingFavoriteFoodId) {
        this.status = FavoriteFoodGiftStatus.ACCEPTED;
        this.resultingFavoriteFoodId = resultingFavoriteFoodId;
        this.respondedAt = LocalDateTime.now();
    }

    public void decline() {
        this.status = FavoriteFoodGiftStatus.DECLINED;
        this.respondedAt = LocalDateTime.now();
    }

    // FavoriteFood 와 같은 합산 규칙 — 세트 전체 칼로리/매크로는 항목 합산으로 계산한다
    public int totalCalories() {
        return items.stream().mapToInt(i -> nz(i.getCalories())).sum();
    }

    public int totalCarbs() {
        return items.stream().mapToInt(i -> nz(i.getCarbs())).sum();
    }

    public int totalProtein() {
        return items.stream().mapToInt(i -> nz(i.getProtein())).sum();
    }

    public int totalFat() {
        return items.stream().mapToInt(i -> nz(i.getFat())).sum();
    }

    private static int nz(Integer v) {
        return v != null ? v : 0;
    }
}
