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

    /**
     * 칼로리·매크로의 출처 — {@code null} 이면 사용자 입력이다({@link NutritionSource} 참고).
     * 사진 저장 후 백그라운드 분석이 채운 값만 {@code AI_ESTIMATED} 로 표시된다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "nutrition_source", length = 20)
    private NutritionSource nutritionSource;

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
                NutritionSource nutritionSource,
                String sharedGroupId, Long createdBy) {
        this.nutritionSource = nutritionSource;
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

    /**
     * 반올림 절반 — "같이 먹기"의 유일한 나눗셈 규칙. {@code null} 은 그대로 둔다
     * (입력 안 한 값은 나눠도 여전히 안 한 값이다).
     *
     * <p>저장 시점 분할({@code MealService.save})과 뒤늦은 전환({@link #convertToShared})이
     * <b>같은 규칙</b>을 써야 해서 여기 한 곳에 둔다.
     */
    public static Integer half(Integer v) {
        return v == null ? null : Math.round(v / 2f);
    }

    /**
     * 이미 저장된 혼자 기록을 "같이 먹기"로 전환한다 — 내 몫을 절반으로 줄이고 묶음 키를 붙인다.
     * 파트너 쪽 복제본은 호출부가 이 메서드 <b>이후에</b> 만든다(이미 절반이 된 값을 그대로 복사).
     *
     * <p>홈에서 사진 한 장으로 저장한 뒤 "같이 드셨나요?"에 답하는 경로가 여기로 온다 —
     * 가장 빠른 기록 경로에 데이트 칩을 넣으면 탭이 늘어나므로, 묻는 시점을 저장 뒤로 미뤘다.
     */
    public void convertToShared(String sharedGroupId) {
        items.forEach(MealItem::halve);
        if (items.isEmpty()) {
            applyTotals(half(calories), half(carbs), half(protein), half(fat));
        } else {
            recalcTotals();
        }
        applyExtraNutrients(half(sugar), half(sodium), half(fiber));
        this.sharedGroupId = sharedGroupId;
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

    /**
     * 데이트 식단 짝 동기화 — 원본(source)의 내용(끼니·메모·사진·합계·추가영양소·항목)을
     * 그대로 복사한다. userId/createdBy/sharedGroupId/id 는 이 레코드(파트너 쪽)의 것을
     * 유지한다 — 소유권은 안 바뀐다. source 값은 save() 에서 이미 절반화된 상태이므로
     * 여기서 다시 나누지 않는다({@link #applyTotals} 를 직접 써서 재합산도 하지 않는다).
     */
    public void syncFrom(Meal source, List<MealItem> copiedItems) {
        update(source.getMealDate(), source.getMealType(), source.getMemo(), source.getPhotoUrl());
        replaceItems(copiedItems);
        applyTotals(source.getCalories(), source.getCarbs(), source.getProtein(), source.getFat());
        applyExtraNutrients(source.getSugar(), source.getSodium(), source.getFiber());
        // 출처도 함께 따라간다 — 한쪽만 "AI 추정"이면 같은 끼니인데 배지가 짝짝이가 된다.
        this.nutritionSource = source.getNutritionSource();
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

    /**
     * 백그라운드 사진 분석 결과를 반영한다 — 항목·합계·추가영양소를 통째로 채우고
     * 출처를 {@link NutritionSource#AI_ESTIMATED} 로 남긴다.
     *
     * <p>호출부({@code MealPhotoAutoAnalysisService})가 "아직 아무것도 안 적힌 기록"만
     * 골라 부르므로 여기서 덮어쓰기를 다시 방어하지 않는다 — 판정과 반영을 두 곳에 두면
     * 어긋난다.
     */
    public void applyAiEstimate(List<MealItem> analyzed, Integer sugar, Integer sodium, Integer fiber) {
        replaceItems(analyzed);
        recalcTotals();
        applyExtraNutrients(sugar, sodium, fiber);
        this.nutritionSource = NutritionSource.AI_ESTIMATED;
    }

    /**
     * 사용자가 이 기록을 직접 저장/수정했다 — AI 추정 배지를 걷어낸다.
     * 수정 화면을 열어 저장했다는 건 화면에 뜬 값을 <b>본인이 확인했다</b>는 뜻이다.
     */
    public void markNutritionUserOwned() {
        this.nutritionSource = NutritionSource.USER;
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
