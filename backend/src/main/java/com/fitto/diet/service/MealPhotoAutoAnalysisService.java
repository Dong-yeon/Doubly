package com.fitto.diet.service;

import com.fitto.common.ai.AiJobService;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealItem;
import com.fitto.diet.dto.MealAnalysisResponse;
import com.fitto.diet.repository.MealRepository;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * 사진만 올려 저장한 끼니를 <b>백그라운드에서</b> 분석해 칼로리·매크로를 채운다
 * ({@code docs/DIET_USAGE_ANALYSIS_2026-09-09.md} 5절).
 *
 * <p><b>왜 만들었나.</b> 기존 흐름은 사진 선택 → "AI로 음식 분석" 탭 → 대기 → 결과 확인 →
 * "완료!" 였다. 즉 <b>사용자에게 "지금 결과를 기다리겠다"는 약속을 요구</b>했다. 그런데
 * 사람들은 음식 사진을 먹기 <b>전에</b> 이미 찍고, 그 사진은 온전한 1인분이 다 보여
 * 추정 조건도 가장 좋다. 버튼 하나가 습관과 기술 사이를 막고 있던 셈이다.
 *
 * <p><b>왜 요청 안에서 하지 않나.</b> Gemini 실패는 대부분 503(모델 과부하)이고 몇 분씩
 * 이어지기도 한다({@link AiJobService} 클래스 주석). 저장 요청 안에서 분석하면 그 실패가
 * 곧 <b>저장 실패</b>로 보인다. 저장과 분석을 떼어놓으면 사진 붙은 기록은 언제나 남고,
 * 분석은 실패해도 로그 한 줄로 끝난다 — 운동 인증샷과 같은 원칙
 * ("읽기 실패와 기록은 독립이다").
 *
 * <p><b>결과를 따로 알리지 않는다.</b> 다음에 식단 탭에 들어올 때 채워진 채로 보이면 된다
 * (사용자 결정, 2026-09-09). 하루 세 번 오는 푸시는 이 경로가 줄이려던 마찰을 도로
 * 만들어낸다.
 */
@Service
public class MealPhotoAutoAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(MealPhotoAutoAnalysisService.class);

    /** {@link AiJobService} 지표 태그 — {@code job=meal-auto-analyze} 로 성공/실패를 센다. */
    private static final String JOB_LABEL = "meal-auto-analyze";

    private final MealRepository mealRepository;
    private final UserRepository userRepository;
    private final FoodAnalysisService foodAnalysisService;
    private final AiJobService aiJobService;

    /**
     * 결과 반영 전용 — <b>반드시 새 트랜잭션</b>이다. 저장 트랜잭션은 이 작업이 시작될 무렵
     * 이미 커밋돼 끝났고, 여기서 여는 트랜잭션은 백그라운드 스레드의 것이다
     * ({@code StreakMilestoneNotifier} 와 같은 처방).
     */
    private final TransactionTemplate newTransaction;

    public MealPhotoAutoAnalysisService(MealRepository mealRepository,
                                        UserRepository userRepository,
                                        FoodAnalysisService foodAnalysisService,
                                        AiJobService aiJobService,
                                        PlatformTransactionManager transactionManager) {
        this.mealRepository = mealRepository;
        this.userRepository = userRepository;
        this.foodAnalysisService = foodAnalysisService;
        this.aiJobService = aiJobService;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * 방금 저장된 끼니가 자동 분석 대상이면 <b>커밋 이후</b> 백그라운드 작업을 건다.
     *
     * <p>커밋 전에 걸면 작업이 먼저 돌아 아직 보이지 않는 행을 조회하게 된다
     * (저장이 롤백되면 유령 작업까지 남는다). 대상이 아니면 조용히 아무 일도 하지 않는다 —
     * 자동 경로라 사용자에게 알릴 실패가 없다.
     */
    public void scheduleIfEligible(Long userId, Meal meal) {
        if (!isEligible(userId, meal)) {
            return;
        }
        Long mealId = meal.getId();
        String photoUrl = meal.getPhotoUrl();
        afterCommit(() -> aiJobService.submit(userId, JOB_LABEL, () -> analyzeAndApply(userId, mealId, photoUrl)));
    }

    /**
     * 자동 분석 대상인지 — 셋 다 만족해야 한다.
     *
     * <ol>
     *   <li>사진이 있다 (분석할 게 있어야 한다)</li>
     *   <li><b>영양 정보가 비어 있다</b> — 항목도 칼로리도 없다. 사용자가 이미 적었거나
     *       바코드로 채웠으면 건드리지 않는다. AI 추정치가 실제 표기값을 덮어쓰면
     *       개선이 아니라 훼손이다.</li>
     *   <li>사용자가 자동 분석을 켜뒀다</li>
     * </ol>
     */
    private boolean isEligible(Long userId, Meal meal) {
        if (meal.getPhotoUrl() == null || meal.getPhotoUrl().isBlank()) {
            return false;
        }
        if (!meal.getItems().isEmpty() || meal.getCalories() != null) {
            return false;
        }
        return userRepository.findById(userId)
                .map(u -> u.isAutoAnalyzeMealPhoto())
                .orElse(false);
    }

    /**
     * 분석 → 반영. {@link AiJobService} 가 예외를 잡아 지표로 남기므로 여기서는 삼키지 않는다
     * (한도 초과·Gemini 장애가 "왜 안 채워졌나"를 나중에 설명해 줘야 한다).
     *
     * @return 작업 결과로 남길 요약 — 폴링하는 화면은 없지만 실패/성공 구분에 쓰인다
     */
    private Object analyzeAndApply(Long userId, Long mealId, String photoUrl) {
        MealAnalysisResponse result = foodAnalysisService.analyze(userId, photoUrl);
        if (!result.isFood() || result.foods().isEmpty()) {
            log.info("자동 분석: 음식이 아니라고 판단 — 기록은 사진만 남긴다 (mealId={})", mealId);
            return java.util.Map.of("applied", false);
        }
        int applied = newTransaction.execute(status -> apply(mealId, result));
        return java.util.Map.of("applied", applied > 0, "meals", applied);
    }

    /**
     * 결과를 기록에 반영한다. 데이트 식단(같이 먹기)이면 <b>커플 양쪽 몫을 함께</b> 채운다 —
     * 사진 한 장이 둘이 먹은 상을 찍은 것이고, 저장 시점에 이미 절반씩 나눠 담기로
     * 정해졌으므로 분석 결과도 같은 규칙으로 나눈다({@code MealService.save} 참고).
     *
     * <p>작업이 실행될 때까지 사용자가 기록을 지우거나 손봤을 수 있으므로 <b>여기서 다시</b>
     * 조건을 확인한다 — 접수 시점의 판단만 믿으면 사용자가 방금 적은 값을 덮어쓴다.
     */
    private int apply(Long mealId, MealAnalysisResponse result) {
        Meal meal = mealRepository.findById(mealId).orElse(null);
        if (meal == null) {
            return 0;
        }
        if (!meal.getItems().isEmpty() || meal.getCalories() != null) {
            log.info("자동 분석 결과 폐기 — 기다리는 사이 사용자가 직접 채웠다 (mealId={})", mealId);
            return 0;
        }

        List<Meal> targets = meal.isSharedMeal()
                ? mealRepository.findBySharedGroupId(meal.getSharedGroupId())
                : List.of(meal);
        boolean halve = meal.isSharedMeal();

        for (Meal target : targets) {
            target.applyAiEstimate(
                    toItems(result, halve),
                    portion(result.totalSugar(), halve),
                    portion(result.totalSodium(), halve),
                    portion(result.totalFiber(), halve));
        }
        mealRepository.saveAll(targets);
        return targets.size();
    }

    private List<MealItem> toItems(MealAnalysisResponse result, boolean halve) {
        List<MealItem> items = new ArrayList<>();
        List<MealAnalysisResponse.AnalyzedFood> foods = result.foods();
        for (int i = 0; i < foods.size(); i++) {
            MealAnalysisResponse.AnalyzedFood f = foods.get(i);
            items.add(MealItem.builder()
                    .name(f.name())
                    .portion(f.portion())
                    .calories(portion(f.calories(), halve))
                    .carbs(portion(f.carbs(), halve))
                    .protein(portion(f.protein(), halve))
                    .fat(portion(f.fat(), halve))
                    .orderNo(i)
                    .build());
        }
        return items;
    }

    /** 데이트 식단이면 내 몫은 절반이다. 0 이 아닌 값이 0 으로 내려앉지 않도록 최소 1 은 남긴다. */
    private Integer portion(Integer value, boolean halve) {
        if (value == null || !halve) {
            return value;
        }
        return value > 0 ? Math.max(1, value / 2) : value;
    }

    /**
     * 커밋 이후 실행. 트랜잭션 밖에서 불렸다면(테스트 등) 지금 바로 실행한다 —
     * {@code CloudinaryImageDeleter} 와 같은 처방.
     */
    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
