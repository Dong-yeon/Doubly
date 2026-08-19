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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 식단 기록 — 끼니별 사진/메모/칼로리. created_at 만 존재하므로 BaseTimeEntity 미상속.
 *
 * <p>실제 음식은 {@link MealItem}(반찬 단위)이고, 이 엔티티의 calories/carbs/protein/fat 은
 * <b>항목 합계 캐시</b>다 — 스트릭·피드·주간 리캡·영양 대시보드·AI 코칭이 전부 조인 없이
 * 이 컬럼만 집계로 읽기 때문에 유지한다. 항목이 있으면 {@link #recalcTotals()} 가 채우고,
 * 항목이 없는 기록(레거시·간단 입력)은 입력값을 그대로 쓴다.
 */
@Entity
@Table(name = "meals")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Meal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "meal_date", nullable = false)
    private LocalDate mealDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private MealType mealType;

    @Column(columnDefinition = "text")
    private String memo;

    @Column(name = "photo_url", columnDefinition = "text")
    private String photoUrl;

    private Integer calories;

    /** 매크로(g) — AI 분석/수동 입력. 목표 대비 남은 양 계산에 사용 */
    private Integer carbs;
    private Integer protein;
    private Integer fat;

    /** 추가 영양소 — AI 분석/수동 입력. 목표(target)는 없고 오늘 합계만 표시하는 정보성 지표 */
    private Integer sugar;
    /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
    private Integer sodium;
    private Integer fiber;

    /**
     * 데이트 식단(같이 먹기) 묶음 키 — 커플 양쪽에 절반씩 등록된 짝을 연결한다.
     * 일반 기록은 null.
     */
    @Column(name = "shared_group_id", length = 36)
    private String sharedGroupId;

    /**
     * 실제로 등록한 사람 — 파트너 명의로 자동 생성된 데이트 식단 복제본에서만 {@link #userId} 와
     * 다르다(내 명의가 아닌 기록이 생기는 유일한 경로라 감사 목적으로 남긴다).
     */
    @Column(name = "created_by")
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * 음식 항목 — 반찬 단위. 히스토리는 한 번에 20건씩 조회되므로 @BatchSize 로 묶어 읽는다
     * (없으면 목록 1건마다 항목 조회가 따로 나가는 N+1).
     */
    @OneToMany(mappedBy = "meal", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderNo asc")
    @BatchSize(size = 50)
    private List<MealItem> items = new ArrayList<>();

    @Builder
    private Meal(Long userId, LocalDate mealDate, MealType mealType,
                String memo, String photoUrl, Integer calories,
                Integer carbs, Integer protein, Integer fat,
                Integer sugar, Integer sodium, Integer fiber,
                String sharedGroupId, Long createdBy) {
        this.userId = userId;
        this.mealDate = mealDate;
        this.mealType = mealType;
        this.memo = memo;
        this.photoUrl = photoUrl;
        this.calories = calories;
        this.carbs = carbs;
        this.protein = protein;
        this.fat = fat;
        this.sugar = sugar;
        this.sodium = sodium;
        this.fiber = fiber;
        this.sharedGroupId = sharedGroupId;
        this.createdBy = createdBy;
    }

    /** 데이트 식단(같이 먹기)으로 등록된 기록인지 — 커플 양쪽에 짝이 있다. */
    public boolean isSharedMeal() {
        return sharedGroupId != null;
    }

    /** 끼니 자체(날짜·끼니·메모·사진) 수정 — 칼로리/매크로는 항목 교체 후 재합산으로 정해진다. */
    public void update(LocalDate mealDate, MealType mealType, String memo, String photoUrl) {
        this.mealDate = mealDate;
        this.mealType = mealType;
        this.memo = memo;
        this.photoUrl = photoUrl;
    }

    /** 합계를 직접 지정 — 항목이 하나도 없는 기록(간단 입력·레거시)에서만 쓴다. */
    public void applyTotals(Integer calories, Integer carbs, Integer protein, Integer fat) {
        this.calories = calories;
        this.carbs = carbs;
        this.protein = protein;
        this.fat = fat;
    }

    /**
     * 추가 영양소(당·나트륨·식이섬유)는 항목({@link MealItem}) 단위가 없어 끼니 레벨 입력값이
     * 그대로 진실이다 — 항목 유무와 무관하게 저장/수정 요청값을 항상 반영한다.
     */
    public void applyExtraNutrients(Integer sugar, Integer sodium, Integer fiber) {
        this.sugar = sugar;
        this.sodium = sodium;
        this.fiber = fiber;
    }

    public void addItem(MealItem item) {
        items.add(item);
        item.assignTo(this);
    }

    /**
     * 항목 전체 교체 — 수정(PUT)은 부분 병합 대신 전량 교체다. 컬렉션을 새로 대입하지 않고
     * 비우고 채워야 orphanRemoval 이 지워진 항목을 실제로 삭제한다.
     */
    public void replaceItems(List<MealItem> newItems) {
        items.clear();
        newItems.forEach(this::addItem);
    }

    /** 항목 합계를 칼로리/매크로에 반영. 항목이 없으면 아무것도 하지 않는다(입력값 유지). */
    public void recalcTotals() {
        if (items.isEmpty()) {
            return;
        }
        this.calories = sum(MealItem::getCalories);
        this.carbs = sum(MealItem::getCarbs);
        this.protein = sum(MealItem::getProtein);
        this.fat = sum(MealItem::getFat);
    }

    private Integer sum(java.util.function.Function<MealItem, Integer> field) {
        return items.stream().mapToInt(i -> nz(field.apply(i))).sum();
    }

    private static int nz(Integer v) {
        return v != null ? v : 0;
    }
}
