package com.fitto.diet.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 식단 즐겨찾기 — 자주 먹는 음식 "세트"를 원탭 추가에 쓴다(예: 닭가슴살+고구마+아몬드).
 * 항목(items)이 실제 음식이고, name 은 세트 전체를 대표하는 라벨이다. 사용자별.
 */
@Entity
@Table(name = "favorite_foods")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FavoriteFood {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 세트 라벨 — 사용자가 직접 입력하거나, 비어있으면 항목명을 이어붙여 자동 생성한다 */
    @Column(nullable = false, length = 100)
    private String name;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "favoriteFood", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderNo asc")
    private List<FavoriteFoodItem> items = new ArrayList<>();

    @Builder
    private FavoriteFood(Long userId, String name) {
        this.userId = userId;
        this.name = name;
    }

    public void addItem(FavoriteFoodItem item) {
        items.add(item);
        item.assignTo(this);
    }

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
