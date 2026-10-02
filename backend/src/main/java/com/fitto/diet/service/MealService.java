package com.fitto.diet.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealItem;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.dto.CoupleMealGoalResponse;
import com.fitto.diet.dto.FoodLookupRequest;
import com.fitto.diet.dto.FoodLookupResponse;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.PartnerMealTodayResponse;
import com.fitto.diet.dto.PhotoRecordLookupResponse;
import com.fitto.diet.dto.MealStatsResponse;
import com.fitto.diet.dto.RecentFoodResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.repository.MealItemRepository;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.domain.FeedReaction;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.streak.service.StreakService;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.dto.CalendarDayResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.Objects;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 식단 기록 서비스 — 저장·오늘 조회·히스토리·캘린더·통계·삭제, 커플 상대방 오늘 여부.
 * 운동(WorkoutService) 구조를 미러링한다.
 */
@Service
@Transactional(readOnly = true)
public class MealService {

    private static final Logger log = LoggerFactory.getLogger(MealService.class);
    private static final int HISTORY_PAGE_SIZE = 20;
    private static final int RECENT_FOODS_LIMIT = 8;
    /** 기록이 없는 날의 자리표시자 — 매번 새 배열을 만들지 않도록 공유한다(읽기 전용) */
    private static final int[] EMPTY_NUTRITION = new int[6];

    private final MealRepository mealRepository;
    private final MealItemRepository mealItemRepository;
    private final NutritionGoalRepository nutritionGoalRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final StreakService streakService;
    private final FeedReactionRepository feedReactionRepository;
    private final CoupleEventPublisher coupleEventPublisher;
    private final NotificationService notificationService;
    private final PlanGuard planGuard;
    private final PlaceVisitRepository placeVisitRepository;
    private final MealPhotoAutoAnalysisService autoAnalysisService;
    /** 기록 삭제 시 사진까지 지운다 — DB 행만 지우면 이미지는 URL 로 계속 접근 가능하다 */
    private final CloudinaryImageDeleter imageDeleter;

    public MealService(MealRepository mealRepository,
                       MealItemRepository mealItemRepository,
                       NutritionGoalRepository nutritionGoalRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       StreakService streakService,
                       FeedReactionRepository feedReactionRepository,
                       CoupleEventPublisher coupleEventPublisher,
                       NotificationService notificationService,
                       PlanGuard planGuard,
                       PlaceVisitRepository placeVisitRepository,
                       MealPhotoAutoAnalysisService autoAnalysisService,
                       CloudinaryImageDeleter imageDeleter) {
        this.mealRepository = mealRepository;
        this.mealItemRepository = mealItemRepository;
        this.nutritionGoalRepository = nutritionGoalRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.streakService = streakService;
        this.feedReactionRepository = feedReactionRepository;
        this.coupleEventPublisher = coupleEventPublisher;
        this.notificationService = notificationService;
        this.planGuard = planGuard;
        this.placeVisitRepository = placeVisitRepository;
        this.autoAnalysisService = autoAnalysisService;
        this.imageDeleter = imageDeleter;
    }

    @Transactional
    public MealResponse save(Long userId, SaveMealRequest req) {
        /*
         * 멱등 검사 — 다른 무엇보다 먼저 본다. 같은 키로 다시 온 저장은 "새 기록"이 아니라 응답을 못 받은 앱의
         * 재시도이므로 스트릭·응원 푸시·목표 축하·자동 분석을 다시 태우지 않고 먼저 저장된 끼니를 그대로 돌려준다.
         * 아래 사진 중복 검사보다 앞서야 한다 — 사진 기록의 재시도가 MEAL_PHOTO_ALREADY_RECORDED 로 실패하던 경로다.
         * 동시에 도착한 두 요청은 (user_id, client_request_id) unique 인덱스가 두 번째 INSERT 를 막고 컨트롤러가 받는다.
         */
        String clientRequestId = req.clientRequestIdOrNull();
        if (clientRequestId != null) {
            Optional<Meal> already = mealRepository.findByUserIdAndClientRequestId(userId, clientRequestId);
            if (already.isPresent()) {
                return MealResponse.from(already.get());
            }
        }
        if (req.mealDate().isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }
        /*
         * 같은 사진으로 두 번 남기지 않는다. 새로 고른 사진은 매번 새 URL 로 올라가므로 이 조건에 걸리는 건
         * 이미 올라가 있는 URL 을 다시 쓰는 경로뿐이다 — 채팅 사진 → 식단 기록(LOVEBODY_REVIEW §2-5)과,
         * 저장 응답이 끊겨 같은 업로드 URL 로 다시 누른 경우. 둘 다 막는 게 맞다. 앱은 메뉴를 누를 때
         * 먼저 묻고(findByPhoto) 안내하므로 여기는 안전망이다.
         */
        if (req.photoUrl() != null && !req.photoUrl().isBlank()
                && !mealRepository.findByUserIdAndPhoto(userId, req.photoUrl(), PageRequest.of(0, 1)).isEmpty()) {
            throw new BusinessException(ErrorCode.MEAL_PHOTO_ALREADY_RECORDED);
        }

        // "데이트" 칩 — 연결된 커플이 있을 때만 실제로 나눠 담는다. 없으면 플래그가 와도 조용히 무시(혼자 저장).
        Relation couple = null;
        Long partnerId = null;
        if (req.sharedWithPartnerOrDefault()) {
            couple = relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                    .stream().findFirst().orElse(null);
            partnerId = couple != null ? couple.partnerOf(userId) : null;
        }
        boolean isDateMeal = partnerId != null;

        // 목표 달성 판정용 — 이 저장이 해당 날짜의 첫 기록인지 (중복 축하 방지)
        boolean firstMealOfDay = !mealRepository.existsByUserIdAndMealDate(userId, req.mealDate());
        // 영양 목표 판정용 — 이번 기록을 반영하기 전, 그 날짜까지 먹은 단백질(g) 합계.
        // 새 Meal 을 저장하기 전에 구해야 "이전"과 "이번 기록 반영 후"를 나눌 수 있다.
        int proteinBeforeThisMeal = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, req.mealDate())
                .stream().mapToInt(m -> nz(m.getProtein())).sum();

        // 데이트 식단은 "함께 먹은 총량"이 아니라 "내가 먹은 몫"을 기록하는 것 — 항목/합계를 절반으로 줄인다.
        List<MealItem> items = toItems(req);
        Integer calories = req.calories(), carbs = req.carbs(), protein = req.protein(), fat = req.fat();
        Integer sugar = req.sugar(), sodium = req.sodium(), fiber = req.fiber();
        if (isDateMeal) {
            items = items.stream().map(this::halveItem).toList();
            calories = half(calories);
            carbs = half(carbs);
            protein = half(protein);
            fat = half(fat);
            sugar = half(sugar);
            sodium = half(sodium);
            fiber = half(fiber);
        }
        String sharedGroupId = isDateMeal ? UUID.randomUUID().toString() : null;

        Meal meal = Meal.builder()
                .userId(userId)
                .mealDate(req.mealDate())
                .mealType(req.mealType())
                .memo(req.memo())
                .photoUrl(req.photoUrl())
                .calories(calories)
                .carbs(carbs)
                .protein(protein)
                .fat(fat)
                .sugar(sugar)
                .sodium(sodium)
                .fiber(fiber)
                .sharedGroupId(sharedGroupId)
                .clientRequestId(clientRequestId)
                .build();
        // 항목을 보냈으면 그게 기준 — 합계는 서버가 다시 더한다(요청의 합계값은 무시)
        items.forEach(meal::addItem);
        meal.recalcTotals();
        mealRepository.save(meal);

        List<MealResponse.GoalHighlight> goals =
                detectGoalsAchieved(userId, proteinBeforeThisMeal, meal.getProtein());

        if (isDateMeal) {
            // halving 은 위에서 이미 끝났다 — 파트너 몫은 내 기록을 그대로 복제만 한다(두 번 나누지 않도록).
            Meal partnerMeal = copyForPartner(meal, partnerId, userId);
            mealRepository.save(partnerMeal);
            afterSharedMealAdded(couple, userId, partnerId, meal.getMealDate(), firstMealOfDay);
        } else {
            afterMealsAdded(userId, meal.getMealDate(), firstMealOfDay, false);
        }

        /*
         * 사진만 올리고 영양 정보를 비워둔 기록이면 커밋 이후 백그라운드로 분석을 건다.
         * 여기서는 조건 판정도 하지 않는다 — 대상 여부와 반영 규칙을 한 곳에 모아둬야
         * 어긋나지 않는다(MealPhotoAutoAnalysisService 참고). 데이트 식단이면 파트너 몫까지
         * 그쪽에서 함께 채우므로 이 호출 하나로 끝난다.
         */
        autoAnalysisService.scheduleIfEligible(userId, meal);
        return MealResponse.from(meal, goals);
    }

    /**
     * 지정한 날짜(기본: 어제)의 식단을 오늘 날짜로 통째로 복사 — 매일 비슷한 식단을 먹는
     * 운동 유저를 위한 3초 퀵 로깅. 사진/메모/칼로리/매크로를 그대로 들고 오고, 끼니 종류도 유지한다.
     */
    /**
     * 같은 멱등키의 저장이 동시에 들어와 unique 인덱스가 두 번째를 막았을 때 — 먼저 커밋된 끼니를 돌려준다.
     * 없으면(다른 제약 위반이었다면) 빈 값이라 호출자가 원래 예외를 다시 던진다.
     */
    @Transactional(readOnly = true)
    public Optional<MealResponse> findSavedByClientRequestId(Long userId, String clientRequestId) {
        if (clientRequestId == null) return Optional.empty();
        return mealRepository.findByUserIdAndClientRequestId(userId, clientRequestId).map(MealResponse::from);
    }

    @Transactional
    public List<MealResponse> copyFrom(Long userId, LocalDate sourceDate) {
        LocalDate today = KstClock.today();
        // 오늘을 오늘로 불러오면 오늘 식단이 통째로 한 벌 더 생긴다 — 미래뿐 아니라 오늘도 막는다.
        if (!sourceDate.isBefore(today)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "지난 날짜의 식단만 불러올 수 있어요.");
        }
        List<Meal> sourceMeals = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, sourceDate);
        if (sourceMeals.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "해당 날짜에는 식단 기록이 없어요.");
        }
        /*
         * 이미 불러온 끼니는 건너뛴다 — 버튼은 요청 중에만 잠기므로 끝난 뒤 다시 누르면 그날 식단이
         * 한 벌 더 생겼다. 복사본에는 표시가 따로 없어서 "내용이 같은 오늘 끼니"를 이미 불러온 것으로 본다.
         * 하나씩 짝지어 지우므로(멀티셋) 어제 같은 간식을 두 번 먹었다면 오늘 하나만 있어도 하나는 더 온다.
         * 손으로 고친 복사본은 더 이상 같지 않으니 다시 불러올 수 있다 — 막는 것보다 그쪽이 덜 놀랍다.
         */
        List<CopyKey> alreadyToday = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, today)
                .stream().map(CopyKey::of).collect(Collectors.toCollection(ArrayList::new));
        List<Meal> toCopy = new ArrayList<>();
        for (Meal source : sourceMeals) {
            if (!alreadyToday.remove(CopyKey.of(source))) {
                toCopy.add(source);
            }
        }
        if (toCopy.isEmpty()) {
            throw new BusinessException(ErrorCode.MEAL_ALREADY_COPIED);
        }
        boolean firstMealOfDay = !mealRepository.existsByUserIdAndMealDate(userId, today);
        List<Meal> copies = toCopy.stream().map(this::copyOf).toList();
        mealRepository.saveAll(copies);
        afterMealsAdded(userId, today, firstMealOfDay, true);
        return copies.stream().map(MealResponse::from).toList();
    }

    /**
     * 기록 수정 — 반찬(항목) 하나만 고치거나 빼는 경로. 항목은 부분 병합이 아니라
     * <b>전량 교체</b>다(요청에 담긴 목록이 곧 최종 상태). 칼로리·매크로는 항목이 있으면
     * 서버가 다시 합산하고, 항목이 없으면 요청의 합계값을 그대로 쓴다.
     *
     * <p>저장(save)과 달리 스트릭 갱신·응원 푸시·목표 달성 축하를 하지 않는다 — 이미 기록한
     * 끼니를 손보는 것이라 그때마다 상대방에게 알림이 가면 소음이고, 단백질 목표 축하는
     * 같은 날 몇 번이고 다시 뜬다. 대신 커플 화면이 바로 갱신되도록 DIET 이벤트만 발행한다.
     */
    @Transactional
    public MealResponse update(Long userId, Long mealId, SaveMealRequest req) {
        if (req.mealDate().isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }
        Meal meal = mealRepository.findById(mealId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!meal.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }

        meal.update(req.mealDate(), req.mealType(), req.memo(), req.photoUrl());
        meal.replaceItems(toItems(req));
        if (meal.getItems().isEmpty()) {
            meal.applyTotals(req.calories(), req.carbs(), req.protein(), req.fat());
        } else {
            meal.recalcTotals();
        }
        // 당·나트륨·식이섬유는 항목 단위가 없어 끼니 레벨 요청값이 그대로 진실이다
        // (MealResponse 가 세 값을 내려주므로 수정 화면이 기존 값을 그대로 되돌려 보낸다).
        meal.applyExtraNutrients(req.sugar(), req.sodium(), req.fiber());
        // 수정 화면을 열어 저장했다는 건 화면에 뜬 값을 본인이 확인했다는 뜻 — "AI 추정" 배지를 걷는다.
        meal.markNutritionUserOwned();

        // 데이트 식단은 커플 양쪽에 짝이 있다 — 한쪽만 고치면 두 기록이 어긋난다.
        syncSharedPair(meal);

        publishDietEvent(userId);
        return MealResponse.from(meal);
    }

    /**
     * 이미 저장한 기록을 뒤늦게 "같이 먹기"로 바꾼다 — 홈에서 사진 한 장으로 남긴 뒤
     * "같이 드셨나요?"에 답하는 경로.
     *
     * <p><b>왜 저장 시점에 안 묻나.</b> 홈의 빠른 경로는 존재 이유가 "탭을 최대한 줄이는 것"
     * 이라, 사진을 고르기 전에 데이트 여부를 묻는 순간 시트가 두 단이 된다. 대신 저장하고
     * <b>나서</b> 한 번 물어본다 — 안 누르면 그냥 혼자 기록이고 잃는 게 없다.
     *
     * <p>저장(save)의 데이트 경로와 결과가 같아야 한다: 내 몫은 절반이 되고, 파트너 명의로
     * 짝이 생기고, 파트너 스트릭·알림·커플 이벤트가 뒤따른다.
     */
    @Transactional
    public MealResponse share(Long userId, Long mealId) {
        Meal meal = mealRepository.findById(mealId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!meal.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (meal.isSharedMeal()) {
            // 이미 나눈 기록을 또 나누면 내 몫이 1/4 이 된다 — 두 번 눌렀을 때의 방어.
            return MealResponse.from(meal);
        }
        Relation couple = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "연결된 커플이 없어요."));
        Long partnerId = couple.partnerOf(userId);

        /*
         * 커플 주간 목표 판정용 — 파트너가 그날 <b>아직</b> 기록이 없었는지를 복제 전에 본다.
         * 이 전환으로 "그날 둘 다 기록"이 새로 성립하는 경우에만 축하가 나가야 한다
         * (justAchievedGoal 이 이 값을 그런 뜻으로 쓴다).
         */
        boolean newlyQualifiesDate = !mealRepository.existsByUserIdAndMealDate(partnerId, meal.getMealDate());

        /*
         * 위의 isSharedMeal 은 순차 재탭만 막는다 — 홈 토스트를 연달아 누르면 두 요청이 동시에 "혼자 기록"을
         * 읽고 둘 다 나눴다. 조건부 UPDATE 로 먼저 선점한 요청만 나누고, 진 쪽은 이긴 쪽의 결과를 돌려준다.
         */
        String sharedGroupId = UUID.randomUUID().toString();
        if (mealRepository.claimForSharing(mealId, sharedGroupId) == 0) {
            return MealResponse.from(mealRepository.findById(mealId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND)));
        }
        // 선점 쿼리가 영속성 컨텍스트를 비웠다 — 다시 읽어서 나눈다
        meal = mealRepository.findById(mealId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        meal.convertToShared(sharedGroupId);
        mealRepository.save(meal);
        mealRepository.save(copyForPartner(meal, partnerId, userId));

        afterSharedMealAdded(couple, userId, partnerId, meal.getMealDate(), newlyQualifiesDate);
        return MealResponse.from(meal);
    }

    /** 데이트 식단 짝 동기화 — 자기 자신을 뺀 나머지(파트너 몫)에 내용만 반영한다. */
    private void syncSharedPair(Meal source) {
        if (!source.isSharedMeal()) {
            return;
        }
        for (Meal pair : mealRepository.findBySharedGroupId(source.getSharedGroupId())) {
            if (pair.getId().equals(source.getId())) {
                continue;
            }
            pair.syncFrom(source, source.getItems().stream()
                    .map(i -> MealItem.builder()
                            .name(i.getName()).portion(i.getPortion())
                            .calories(i.getCalories()).carbs(i.getCarbs())
                            .protein(i.getProtein()).fat(i.getFat())
                            .orderNo(i.getOrderNo()).build())
                    .toList());
        }
    }

    /** 요청의 음식 항목 → 엔티티. 화면에 보이는 순서를 order_no 로 굳힌다. */
    private List<MealItem> toItems(SaveMealRequest req) {
        List<MealItemRequest> requested = req.itemsOrEmpty();
        List<MealItem> items = new ArrayList<>();
        for (int i = 0; i < requested.size(); i++) {
            MealItemRequest item = requested.get(i);
            items.add(MealItem.builder()
                    .name(item.name().trim())
                    .portion(blankToNull(item.portion()))
                    .calories(item.calories())
                    .carbs(item.carbs())
                    .protein(item.protein())
                    .fat(item.fat())
                    .orderNo(i)
                    .build());
        }
        return items;
    }

    /** 어제 식단 복사 — 항목까지 그대로 들고 와야 복사한 뒤에도 반찬 단위로 손볼 수 있다. */
    private Meal copyOf(Meal source) {
        Meal copy = Meal.builder()
                .userId(source.getUserId())
                .mealDate(KstClock.today())
                .mealType(source.getMealType())
                .memo(source.getMemo())
                .photoUrl(source.getPhotoUrl())
                .calories(source.getCalories())
                .carbs(source.getCarbs())
                .protein(source.getProtein())
                .fat(source.getFat())
                .sugar(source.getSugar())
                .sodium(source.getSodium())
                .fiber(source.getFiber())
                // "약"(AI 추정) 표시도 따라간다 — 같은 숫자를 옮겼다고 본인이 확인한 값이 되지는 않는다
                .nutritionSource(source.getNutritionSource())
                .build();
        for (MealItem item : source.getItems()) {
            copy.addItem(MealItem.builder()
                    .name(item.getName())
                    .portion(item.getPortion())
                    .calories(item.getCalories())
                    .carbs(item.getCarbs())
                    .protein(item.getProtein())
                    .fat(item.getFat())
                    .orderNo(item.getOrderNo())
                    .build());
        }
        return copy;
    }

    /**
     * "이미 불러온 끼니인가" 판정용 — {@link #copyOf} 가 옮기는 내용 그대로다. 날짜·id·짝 묶음은 뺀다
     * (복사본은 날짜가 다르고, 데이트 식단을 불러오면 혼자 기록이 되므로).
     */
    private record CopyKey(MealType mealType, String memo, String photoUrl,
                           Integer calories, Integer carbs, Integer protein, Integer fat,
                           Integer sugar, Integer sodium, Integer fiber, List<ItemKey> items) {
        private record ItemKey(String name, String portion,
                               Integer calories, Integer carbs, Integer protein, Integer fat) {}

        static CopyKey of(Meal m) {
            return new CopyKey(m.getMealType(), m.getMemo(), m.getPhotoUrl(),
                    m.getCalories(), m.getCarbs(), m.getProtein(), m.getFat(),
                    m.getSugar(), m.getSodium(), m.getFiber(),
                    m.getItems().stream()
                            .map(i -> new ItemKey(i.getName(), i.getPortion(),
                                    i.getCalories(), i.getCarbs(), i.getProtein(), i.getFat()))
                            .toList());
        }
    }

    private String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    /** 데이트 식단 — 항목 하나를 절반 값으로 복제(원본 리스트는 손대지 않고 새 인스턴스를 만든다). */
    private MealItem halveItem(MealItem item) {
        return MealItem.builder()
                .name(item.getName())
                .portion(item.getPortion())
                .calories(half(item.getCalories()))
                .carbs(half(item.getCarbs()))
                .protein(half(item.getProtein()))
                .fat(half(item.getFat()))
                .orderNo(item.getOrderNo())
                .build();
    }

    /** 절반화 규칙은 {@link Meal#half} 한 곳에만 둔다 — 저장 시점 분할과 뒤늦은 전환이 같아야 한다. */
    private Integer half(Integer v) {
        return Meal.half(v);
    }

    /**
     * 데이트 식단 — 이미 절반으로 계산된 내 기록을 파트너 명의로 그대로 복제한다.
     * halving 은 save() 에서 한 번만 하고 여기서는 복제만 한다(두 번 나누는 실수를 막기 위해).
     */
    private Meal copyForPartner(Meal source, Long partnerId, Long createdBy) {
        Meal copy = Meal.builder()
                .userId(partnerId)
                .mealDate(source.getMealDate())
                .mealType(source.getMealType())
                .memo(source.getMemo())
                .photoUrl(source.getPhotoUrl())
                .calories(source.getCalories())
                .carbs(source.getCarbs())
                .protein(source.getProtein())
                .fat(source.getFat())
                .sugar(source.getSugar())
                .sodium(source.getSodium())
                .fiber(source.getFiber())
                // 출처도 복사한다 — 저장 시점엔 늘 null 이지만, 사진 분석이 먼저 끝난 뒤
                // "같이 먹기"로 전환하면 원본이 AI_ESTIMATED 다. 안 옮기면 같은 끼니인데
                // 한쪽만 "약 400"으로, 다른 쪽은 "400"으로 보인다.
                .nutritionSource(source.getNutritionSource())
                .sharedGroupId(source.getSharedGroupId())
                .createdBy(createdBy)
                .build();
        for (MealItem item : source.getItems()) {
            copy.addItem(MealItem.builder()
                    .name(item.getName())
                    .portion(item.getPortion())
                    .calories(item.getCalories())
                    .carbs(item.getCarbs())
                    .protein(item.getProtein())
                    .fat(item.getFat())
                    .orderNo(item.getOrderNo())
                    .build());
        }
        return copy;
    }

    /** 커플 화면 실시간 갱신만 — 푸시 없이. */
    private void publishDietEvent(Long userId) {
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> coupleEventPublisher.publish(c.getId(), CoupleEvent.DIET));
    }

    /** 저장/복사 공통 후처리 — 스트릭 갱신 + 커플 실시간 반영/응원 푸시(+목표 달성 축하). */
    private void afterMealsAdded(Long userId, LocalDate mealDate, boolean firstMealOfDay, boolean copied) {
        // 식단 스트릭 갱신 (개인 + 커플) — 별도 트랜잭션, 실패해도 식단 저장은 유지
        try {
            streakService.updateOnMeal(userId, mealDate);
        } catch (RuntimeException e) {
            log.warn("식단 스트릭 갱신 실패 (기록은 저장됨) userId={}, date={}: {}",
                    userId, mealDate, e.getMessage());
        }

        // 커플 실시간 반영 + 응원 푸시 (+ 목표 달성 축하)
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    coupleEventPublisher.publish(c.getId(), CoupleEvent.DIET);
                    Long partnerId = c.partnerOf(userId);
                    String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
                    if (justAchievedGoal(c, userId, partnerId, mealDate, firstMealOfDay)) {
                        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                                "이번 주 식단 목표 달성!",
                                myName + "님과 함께 주 " + c.getDietGoalDays() + "일 목표를 채웠어요!",
                                PushLinks.DIET);
                    } else if (copied) {
                        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                                "오늘도 같은 식단!",
                                myName + "님이 어제 식단을 그대로 기록했어요!",
                                PushLinks.DIET);
                    } else {
                        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                                "오늘 뭐 먹었을까?",
                                myName + "님이 식단을 기록했어요!",
                                PushLinks.DIET);
                    }
                });
    }

    /**
     * 데이트 식단 저장 후처리 — 양쪽 스트릭 갱신 + 커플 실시간 반영 + 전용 푸시(파트너에게 1건만).
     * 일반 저장({@link #afterMealsAdded})과 갈라 둔 이유: 이 저장은 나와 파트너 두 곳에 각각
     * insert 가 일어나는데, 응원 푸시가 저장 횟수만큼(2번) 가면 스팸이다. 문구도 "함께 기록했다"로
     * 다르게 준다. 스트릭은 두 사람 다 오늘 진짜로 기록이 생겼으니 둘 다 갱신한다.
     */
    private void afterSharedMealAdded(Relation couple, Long userId, Long partnerId,
                                      LocalDate mealDate, boolean firstMealOfDay) {
        try {
            streakService.updateOnMeal(userId, mealDate);
        } catch (RuntimeException e) {
            log.warn("식단 스트릭 갱신 실패 (기록은 저장됨) userId={}, date={}: {}",
                    userId, mealDate, e.getMessage());
        }
        try {
            streakService.updateOnMeal(partnerId, mealDate);
        } catch (RuntimeException e) {
            log.warn("식단 스트릭 갱신 실패 (기록은 저장됨) userId={}, date={}: {}",
                    partnerId, mealDate, e.getMessage());
        }

        coupleEventPublisher.publish(couple.getId(), CoupleEvent.DIET);
        String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
        if (justAchievedGoal(couple, userId, partnerId, mealDate, firstMealOfDay)) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER,
                    "이번 주 식단 목표 달성!",
                    myName + "님과 함께 주 " + couple.getDietGoalDays() + "일 목표를 채웠어요!",
                    PushLinks.DIET);
        } else {
            notificationService.notify(partnerId, NotificationCategory.PARTNER,
                    "함께 먹었어요 🍽",
                    myName + "님과 데이트 식단을 함께 기록했어요!",
                    PushLinks.DIET);
        }
    }

    /**
     * 영양 목표 달성 감지 — 이번 기록으로 그 날짜의 단백질 누적 섭취가 <b>막</b> 목표를
     * 넘겼는지. 이전에 이미 넘겼었다면(그 날 이미 축하했으므로) 다시 알리지 않는다.
     *
     * <p>목표(target)가 설정 안 돼 있으면(대시보드 목표 미사용) 볼 게 없다.
     * 지금은 단백질만 본다 — 다른 매크로는 필요해지면 같은 방식으로 여기에 추가한다.
     */
    private List<MealResponse.GoalHighlight> detectGoalsAchieved(Long userId, int proteinBefore,
                                                                  Integer proteinInThisMeal) {
        Integer target = nutritionGoalRepository.findById(userId)
                .map(NutritionGoal::getTargetProtein).orElse(null);
        if (target == null || target <= 0) {
            return List.of();
        }
        int consumed = proteinBefore + nz(proteinInThisMeal);
        if (proteinBefore >= target || consumed < target) {
            return List.of();
        }
        return List.of(new MealResponse.GoalHighlight("protein", consumed, target));
    }

    private int nz(Integer v) {
        return v != null ? v : 0;
    }

    /**
     * 이 저장으로 커플 주간 목표를 "방금" 달성했는지.
     * 조건: 해당 날짜 첫 기록 + 상대방도 그 날 기록 + 둘 다 기록한 날 수가 정확히 목표에 도달.
     */
    private boolean justAchievedGoal(Relation couple, Long userId, Long partnerId,
                                     LocalDate mealDate, boolean firstMealOfDay) {
        Integer goalDays = couple.getDietGoalDays();
        if (goalDays == null || !firstMealOfDay || partnerId == null) {
            return false;
        }
        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        // 이번 주 범위 밖의 (과거) 기록은 목표에 반영되지 않음
        if (mealDate.isBefore(weekStart) || mealDate.isAfter(today)) {
            return false;
        }
        if (!mealRepository.existsByUserIdAndMealDate(partnerId, mealDate)) {
            return false;
        }
        var myDates = new HashSet<>(mealRepository.findMealDates(userId, weekStart, today));
        myDates.retainAll(mealRepository.findMealDates(partnerId, weekStart, today));
        return myDates.size() == goalDays;
    }

    public List<MealResponse> findToday(Long userId) {
        return withPlaces(mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, KstClock.today()));
    }

    /**
     * 히스토리 — 오늘 이전, 먹은 날짜 최신순. 오늘 식사는 {@link #findToday} 몫이다.
     *
     * <p><b>커서는 여전히 id 하나로 받는다(구버전·신버전 앱 공통).</b> 앱은 받은 목록의 마지막 카드 id 를
     * 보내므로(dietStore.loadMoreHistory), 서버가 그 행을 찾아 (meal_date, id) 복합 커서로 바꾼다. API 모양이
     * 그대로라 앱 업데이트 없이 정렬만 바뀐다. 그 기록이 그사이 지워졌으면 그보다 먼저 적은 가장 가까운
     * 내 기록을 기준점으로 쓴다 — 드물게 경계 근처가 한두 건 겹치거나 빠질 수 있지만 목록이 끊기지는 않는다.
     * 남의 기록 id 는 내 기록으로 찾지 않으므로 기준점이 되지 않는다.
     */
    public List<MealResponse> findHistory(Long userId, Long cursor) {
        LocalDate today = KstClock.today();
        PageRequest page = PageRequest.of(0, HISTORY_PAGE_SIZE);
        if (cursor == null) {
            return withPlaces(mealRepository.findHistoryFirstPage(userId, today, page));
        }
        Optional<Meal> anchor = mealRepository.findById(cursor)
                .filter(m -> userId.equals(m.getUserId()))
                .or(() -> mealRepository.findTopByUserIdAndIdLessThanOrderByIdDesc(userId, cursor));
        if (anchor.isEmpty()) {
            return List.of();
        }
        Meal a = anchor.get();
        return withPlaces(mealRepository.findHistoryAfter(userId, today, a.getMealDate(), a.getId(), page));
    }

    /**
     * 식단 목록에 장소 연동 여부를 함께 싣는다 — 식단 탭에서 장소를 붙여도 지금까지
     * 식단 탭 어디서도(오늘 목록·히스토리) 다시 확인할 방법이 없었다(2026-09-02 분석).
     *
     * <p>장소별 개별 조회 대신 이 페이지의 meal id 를 한 번에 in 절로 묻는다 — 목록 하나에
     * 최대 {@link #HISTORY_PAGE_SIZE} 건뿐이라 배치 조회로 충분하고, {@code PlaceService}
     * 의 커버 사진 배치 조회({@code findByPlaceIdInOrderByPlaceIdAscIdDesc})와 같은 이유다.
     */
    private List<MealResponse> withPlaces(List<Meal> meals) {
        if (meals.isEmpty()) return List.of();
        List<Long> mealIds = meals.stream().map(Meal::getId).toList();
        Map<Long, PlaceVisitRepository.VisitWithPlace> byMealId = placeVisitRepository.findByMealIdIn(mealIds)
                .stream()
                .collect(java.util.stream.Collectors.toMap(vp -> vp.getVisit().getMealId(), vp -> vp));
        Map<Long, Long> reactionTarget = reactionTargets(meals);
        Map<Long, List<FeedReaction>> reactionsByTarget = new HashMap<>();
        for (FeedReaction r : feedReactionRepository.findByTargetTypeAndTargetIdIn(
                FeedItemType.MEAL, new HashSet<>(reactionTarget.values()))) {
            reactionsByTarget.computeIfAbsent(r.getTargetId(), k -> new ArrayList<>()).add(r);
        }
        return meals.stream()
                .map(m -> {
                    PlaceVisitRepository.VisitWithPlace vp = byMealId.get(m.getId());
                    MealResponse res = vp == null
                            ? MealResponse.from(m)
                            : MealResponse.from(m, vp.getVisit().getPlaceId(), vp.getPlaceName());
                    return res.withReactions(summarizeReactions(
                            reactionsByTarget.getOrDefault(reactionTarget.get(m.getId()), List.of()), m.getUserId()));
                })
                .toList();
    }

    /**
     * 끼니 id → 반응이 달려 있는 id. 보통은 자기 자신이고, <b>상대가 등록한 데이트 식단의 내 몫(복사본)</b>만
     * 원본 id 다 — 피드는 원본만 보여주므로(created_by 필터, MealRepository) 반응도 원본에 달린다
     * (LOVEBODY_REVIEW §2-4). 짝은 이 페이지의 복사본 그룹만 한 번에 묻는다(N+1 없음).
     */
    private Map<Long, Long> reactionTargets(List<Meal> meals) {
        Map<Long, Long> target = new HashMap<>();
        Map<String, Long> copyGroups = new HashMap<>();
        for (Meal m : meals) {
            target.put(m.getId(), m.getId());
            boolean partnerCopy = m.isSharedMeal() && m.getCreatedBy() != null && !m.getCreatedBy().equals(m.getUserId());
            if (partnerCopy) copyGroups.put(m.getSharedGroupId(), m.getId());
        }
        if (!copyGroups.isEmpty()) {
            for (Meal other : mealRepository.findBySharedGroupIdIn(copyGroups.keySet())) {
                boolean original = other.getCreatedBy() == null || other.getCreatedBy().equals(other.getUserId());
                Long copyId = copyGroups.get(other.getSharedGroupId());
                if (original && copyId != null && !other.getId().equals(copyId)) {
                    target.put(copyId, other.getId());
                }
            }
        }
        return target;
    }

    /** 이모지별 요약 — 피드(FeedItemMapper.summarize)와 같은 모양. mine 은 이 목록 주인 기준 */
    private static List<ReactionSummary> summarizeReactions(List<FeedReaction> reactions, Long viewerId) {
        Map<String, List<FeedReaction>> byEmoji = new LinkedHashMap<>();
        for (FeedReaction r : reactions) {
            byEmoji.computeIfAbsent(r.getEmoji(), k -> new ArrayList<>()).add(r);
        }
        return byEmoji.entrySet().stream()
                .map(e -> new ReactionSummary(e.getKey(), e.getValue().size(),
                        e.getValue().stream().anyMatch(r -> viewerId.equals(r.getUserId()))))
                .toList();
    }

    /**
     * 최근 먹은 음식 자동완성 — 즐겨찾기와 달리 <b>따로 저장하지 않아도</b> 최근 기록에서 자동으로
     * 뽑힌다. 최근 음식 항목(meal_items) 300건을 이름 기준으로 묶어 빈도 → 최근순으로 상위 N개.
     *
     * <p>예전엔 끼니 memo 를 음식 이름으로 썼는데, 항목 구조(V39) 이후 memo 는 "오늘 좀 짰음" 같은
     * 한마디로 쓰이는 자리라 그게 "최근 먹은 음식"으로 뜨는 게 어색했다. 이제 memo 는 보지 않는다.
     * 대표값은 같은 이름 중 <b>칼로리가 있는 가장 최근 항목</b> — 탭하면 칼로리가 바로 채워지게.
     */
    public List<RecentFoodResponse> recentFoods(Long userId) {
        List<MealItem> recent = mealItemRepository.findRecentByUser(userId, PageRequest.of(0, 300));
        // LinkedHashMap 순회 순서 = 최초 삽입 순서 = 최근순이므로, 이름별 첫 등장이 가장 최근 항목이다
        Map<String, MealItem> representative = new LinkedHashMap<>();
        Map<String, Integer> counts = new HashMap<>();
        for (MealItem i : recent) {
            String key = normalizeFoodName(i.getName());
            if (key.isEmpty()) continue;
            counts.merge(key, 1, Integer::sum);
            MealItem current = representative.get(key);
            if (current == null || (current.getCalories() == null && i.getCalories() != null)) {
                representative.put(key, i);
            }
        }
        return representative.entrySet().stream()
                .sorted(Comparator
                        .<Map.Entry<String, MealItem>>comparingInt(e -> counts.get(e.getKey())).reversed()
                        .thenComparing(e -> e.getValue().getMeal().getCreatedAt(), Comparator.reverseOrder()))
                .limit(RECENT_FOODS_LIMIT)
                .map(e -> RecentFoodResponse.of(e.getValue(), counts.get(e.getKey())))
                .toList();
    }

    /**
     * 내 기록에서 음식 영양 정보 찾기 — 즐겨찾기·추천 칩처럼 칼로리 없이 들어온 음식을, 과거에
     * 이미 계산해 기록한 값으로 채운다. 이름별로 <b>칼로리가 있는 가장 최근 항목</b> 하나를 돌려주고,
     * 기록이 없는 이름은 응답에서 빠진다(클라이언트가 그 항목만 AI 로 넘긴다).
     */
    public List<FoodLookupResponse> lookupFoods(Long userId, FoodLookupRequest request) {
        // 요청 이름 → 정규화 키. 같은 키로 여러 이름이 오면(예: "계란"/"계란 ") 각각 돌려준다
        Map<String, String> keyByRequested = new LinkedHashMap<>();
        for (String name : request.names()) {
            if (name == null) continue;
            String key = normalizeFoodName(name);
            if (!key.isEmpty()) keyByRequested.putIfAbsent(name, key);
        }
        if (keyByRequested.isEmpty()) return List.of();

        Map<String, MealItem> latestByKey = new HashMap<>();
        for (MealItem i : mealItemRepository.findRecentWithCalories(userId, new HashSet<>(keyByRequested.values()))) {
            latestByKey.putIfAbsent(normalizeFoodName(i.getName()), i); // 최근순 정렬이라 첫 건이 최신
        }
        return keyByRequested.entrySet().stream()
                .filter(e -> latestByKey.containsKey(e.getValue()))
                .map(e -> FoodLookupResponse.of(e.getKey(), latestByKey.get(e.getValue())))
                .toList();
    }

    /** 음식 이름 비교 키 — trim + 소문자. 저장소 쿼리(lower(name))와 같은 규칙이어야 한다. */
    static String normalizeFoodName(String name) {
        return name == null ? "" : name.trim().toLowerCase();
    }

    public List<CalendarDayResponse> calendar(Long userId, int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return mealRepository.findMealDates(userId, start, end).stream()
                .map(d -> new CalendarDayResponse(d, true))
                .toList();
    }

    /**
     * 식단 통계 — 무료 구간(기록일 수·최근 7일)은 항상, 심화 30일은 {@link Feature#FULL_STATS} 일 때만.
     *
     * <p>30일치를 <b>잠겼을 때는 조회조차 하지 않는다</b>. 어차피 안 내려줄 데이터를 읽는 건
     * 순수 낭비이고, 무료 사용자가 통계 화면을 열 때마다 30일 스캔이 도는 것도 원가다.
     */
    public MealStatsResponse stats(Long userId) {
        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        LocalDate monthStart = today.withDayOfMonth(1);

        int weeklyDays = mealRepository.findMealDates(userId, weekStart, today).size();
        int monthlyDays = mealRepository.findMealDates(userId, monthStart, today).size();
        long totalDays = mealRepository.countDistinctMealDates(userId);

        // 최근 7일 끼니 완료 여부 + 일별 칼로리·단백질 합계
        LocalDate from7 = today.minusDays(6);
        Map<LocalDate, Integer> calByDate = new HashMap<>();
        Map<LocalDate, Integer> proteinByDate = new HashMap<>();
        var doneDates = new HashSet<LocalDate>();
        for (Meal m : mealRepository.findByUserIdAndMealDateBetween(userId, from7, today)) {
            doneDates.add(m.getMealDate());
            if (m.getCalories() != null) {
                calByDate.merge(m.getMealDate(), m.getCalories(), Integer::sum);
            }
            if (m.getProtein() != null) {
                proteinByDate.merge(m.getMealDate(), m.getProtein(), Integer::sum);
            }
        }
        String[] weekdays = {"월", "화", "수", "목", "금", "토", "일"};
        List<MealStatsResponse.DayStat> last7 = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            LocalDate d = from7.plusDays(i);
            last7.add(new MealStatsResponse.DayStat(
                    d.toString(), weekdays[d.getDayOfWeek().getValue() - 1],
                    doneDates.contains(d), calByDate.getOrDefault(d, 0),
                    proteinByDate.getOrDefault(d, 0)));
        }

        boolean deepAllowed = planGuard.allows(userId, Feature.FULL_STATS);
        return new MealStatsResponse(weeklyDays, monthlyDays, totalDays, last7,
                !deepAllowed, deepAllowed ? deepStats(userId, today) : null);
    }

    /** 최근 30일 일별 영양소 + 목표치 — 기록이 없는 날도 0으로 채운다(격자가 비지 않도록). */
    private MealStatsResponse.DeepStats deepStats(Long userId, LocalDate today) {
        LocalDate from = today.minusDays(29);
        Map<LocalDate, int[]> byDate = new HashMap<>();
        for (Meal m : mealRepository.findByUserIdAndMealDateBetween(userId, from, today)) {
            int[] sums = byDate.computeIfAbsent(m.getMealDate(), k -> new int[6]);
            sums[0] += orZero(m.getCalories());
            sums[1] += orZero(m.getProtein());
            sums[2] += orZero(m.getCarbs());
            sums[3] += orZero(m.getFat());
            sums[4] += orZero(m.getSugar());
            sums[5] += orZero(m.getSodium());
        }
        List<MealStatsResponse.DayNutrition> days = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            LocalDate d = from.plusDays(i);
            int[] s = byDate.getOrDefault(d, EMPTY_NUTRITION);
            days.add(new MealStatsResponse.DayNutrition(
                    d.toString(), s[0], s[1], s[2], s[3], s[4], s[5]));
        }

        MealStatsResponse.NutritionTargets targets = nutritionGoalRepository.findById(userId)
                .map(g -> new MealStatsResponse.NutritionTargets(
                        g.getTargetCalories(), g.getTargetProtein(), g.getTargetCarbs(), g.getTargetFat()))
                .filter(t -> !t.isEmpty())
                .orElse(null);
        return new MealStatsResponse.DeepStats(days, targets);
    }

    private static int orZero(Integer value) {
        return value != null ? value : 0;
    }

    @Transactional
    public void delete(Long userId, Long mealId) {
        Meal meal = mealRepository.findById(mealId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!meal.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        /*
         * 사진도 함께 지운다 — 행만 지우면 이미지는 URL 로 계속 접근 가능하다
         * (WorkoutService.delete 와 같은 처방). 식단은 가장 자주 찍는 사진이라 여기가
         * 비어 있으면 고아 파일이 제일 빠르게 쌓인다.
         *
         * <p>탈퇴는 이미 거두고 있었다({@code UserDataPurger} 가 meals.photo_url 을 모은다).
         * 비어 있던 건 <b>기록 한 건을 지우는 이 경로</b>뿐이다 — 관계 종료
         * ({@code RelationRecordPurger})는 식단 <b>행 자체를 지우지 않으므로</b>(개인 데이터라
         * 관계가 끝나도 남는다) 사진을 남기는 것이 맞다.
         *
         * 커밋 이후에 지운다(deleteAllAfterCommit): 외부 호출 실패가 DB 삭제를 되돌리면 안 된다.
         */
        List<String> photoUrls;
        if (meal.isSharedMeal()) {
            // 데이트 식단은 커플 양쪽에 짝이 있다 — 한쪽만 지우면 남은 쪽이 존재하지 않는
            // 짝을 계속 가리켜(sharedGroupId 가 그대로 남아) "같이 먹기" 배지가 잘못 뜬다.
            List<Meal> pair = mealRepository.findBySharedGroupId(meal.getSharedGroupId());
            // 피드 카드 응원 반응 — 다형 참조라 FK 가 없어 직접 지운다 (V60 주석 참고)
            feedReactionRepository.deleteByTargetTypeAndTargetIdIn(FeedItemType.MEAL,
                    pair.stream().map(Meal::getId).toList());
            /*
             * 나눠 담은 짝은 같은 사진 URL 을 복사해 갖는다 — 한 번만 지우면 되지만 중복이
             * 있어도 무방하다(지운 자산을 다시 지우는 호출은 멱등이다. Purger 주석과 같은 근거).
             */
            photoUrls = pair.stream().map(Meal::getPhotoUrl).filter(Objects::nonNull).distinct().toList();
            // 장소를 붙인 끼니면 방문이 이 행을 가리킨다(FK) — 방문은 남기고 연결만 끊는다
            placeVisitRepository.detachMeals(pair.stream().map(Meal::getId).toList());
            mealRepository.deleteAll(pair);
            publishDietEvent(userId);
        } else {
            feedReactionRepository.deleteByTargetTypeAndTargetId(FeedItemType.MEAL, mealId);
            photoUrls = meal.getPhotoUrl() != null ? List.of(meal.getPhotoUrl()) : List.of();
            placeVisitRepository.detachMeals(List.of(mealId));
            mealRepository.delete(meal);
        }
        // 채팅에 공유한 MEAL_CARD 처럼 같은 URL 을 쓰는 다른 행이 남아 있으면 삭제기가 파일을 남긴다
        // (StoredMediaReferences) — 여기서는 지운 행의 URL 만 넘긴다
        if (!photoUrls.isEmpty()) {
            imageDeleter.deleteAllAfterCommit(photoUrls);
        }
    }

    /** 이 사진(URL)으로 남긴 내 식단 — 채팅 사진 → 식단 기록 메뉴가 먼저 묻는다(중복 안내) */
    public PhotoRecordLookupResponse findByPhoto(Long userId, String photoUrl) {
        return mealRepository.findByUserIdAndPhoto(userId, photoUrl, PageRequest.of(0, 1)).stream().findFirst()
                .map(m -> new PhotoRecordLookupResponse(true, m.getId(), m.getMealDate(), m.getMealType().label()))
                .orElseGet(PhotoRecordLookupResponse::none);
    }

    /** 커플 공동 식단 목표 진행률 — 이번 주(월~) 둘 다 기록한 날 수. */
    public CoupleMealGoalResponse coupleGoal(Long userId) {
        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            // 미연결 — 스트립은 나만 그리므로 내 날짜만 싣는다
            return CoupleMealGoalResponse.notConnected(weekStart, sorted(mealRepository.findMealDates(userId, weekStart, today)));
        }
        Relation couple = couples.get(0);
        Long partnerId = couple.partnerOf(userId);

        var myDates = new HashSet<>(mealRepository.findMealDates(userId, weekStart, today));
        var partnerDates = partnerId == null
                ? new HashSet<LocalDate>()
                : new HashSet<>(mealRepository.findMealDates(partnerId, weekStart, today));

        var both = new HashSet<>(myDates);
        both.retainAll(partnerDates);

        Integer goalDays = couple.getDietGoalDays();
        boolean achieved = goalDays != null && both.size() >= goalDays;
        return new CoupleMealGoalResponse(true, goalDays, weekStart,
                myDates.size(), partnerDates.size(), both.size(), achieved,
                sorted(myDates), sorted(partnerDates));
    }

    private static List<LocalDate> sorted(java.util.Collection<LocalDate> dates) {
        return dates.stream().distinct().sorted().toList();
    }

    /**
     * 커플 상대의 오늘 식단 — 기록 여부 + 끼니 종류(홈 "오늘 챙김" 링). 예전의 존재 확인 쿼리를 끼니 종류
     * 조회 하나로 바꿨다(completed 는 그 목록이 비었는지) — 쿼리 수는 그대로 1회, 날짜는 KstClock.
     */
    public PartnerMealTodayResponse partnerToday(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return PartnerMealTodayResponse.notConnected();
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return PartnerMealTodayResponse.notConnected();
        }
        String partnerName = userRepository.findById(partnerId)
                .map(u -> u.getName()).orElse(null);
        List<MealType> mealTypes = mealRepository.findMealTypes(partnerId, KstClock.today()).stream().sorted().toList();
        return new PartnerMealTodayResponse(true, partnerName, !mealTypes.isEmpty(), mealTypes);
    }
}
