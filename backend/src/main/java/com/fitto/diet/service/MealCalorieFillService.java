package com.fitto.diet.service;

import com.fitto.common.ai.AiJobService;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealItem;
import com.fitto.diet.dto.BarcodeLookupResponse;
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
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 이름만 적고 칼로리를 비워 둔 음식을 <b>저장 뒤에</b> 채운다 (2026-10-12).
 *
 * <p>예전엔 기록 화면에서 "칼로리 계산"을 눌러 결과를 기다린 뒤에야 저장했다. 1주 계측에서 글로 적은 새 기록은
 * 전부 이 버튼을 눌렀고(docs/meal-photo-auto-analyze-metrics_2026-10-12.md), 사용자 말로는 "또 버튼을 눌러야 한다".
 * 사진만 저장하면 서버가 채우는 길(MealPhotoAutoAnalysisService)이 이미 있으니 글도 같은 원칙으로 간다 —
 * 저장은 바로, 칼로리는 뒤에서.
 *
 * <p>순서는 앱의 "칼로리 계산" 버튼과 같다: ① 공공 DB(식약처) 에서 <b>이름이 정확히 같은</b> 표기값 → ② 남은 것만 AI.
 * ① 은 한도를 쓰지 않고 값이 실제 표기값이라 먼저 본다.
 *
 * <ul>
 *   <li><b>사용자가 적은 값은 건드리지 않는다</b> — 칼로리가 빈 항목만 채운다. 이름도 사용자가 적은 그대로 둔다.
 *   <li>AI 가 보낸 개수만큼 돌려주면 순서대로 짝짓고, 개수가 다르면(“치킨이랑 콜라”를 둘로 나눔 등) 빈 항목들을
 *       AI 가 나눈 목록으로 바꾼다 — 앱 버튼이 목록을 통째로 바꾸던 것보다 덜 건드린다.
 *   <li>AI 가 하나라도 채웠으면 {@code AI_ESTIMATED}("약" 배지). 표기값만으로 채웠으면 출처를 바꾸지 않는다.
 *   <li>기다리는 사이 사용자가 기록을 고쳤으면(항목이 접수 때와 다르면) 결과를 버린다.
 *   <li>데이트 식단이면 짝 기록도 같이 채우고, 채운 값은 사진 경로처럼 절반으로 나눈다(적은 값은 저장 때 이미 나뉘었다).
 *   <li>설정 스위치는 사진과 같은 {@code autoAnalyzeMealPhoto} 를 쓴다(앱 문구는 "칼로리 자동으로 채우기").
 *   <li>AI 한도를 다 썼거나 실패하면 표기값으로 찾은 것만 채우고 조용히 끝난다 — 자동 경로라 알릴 화면이 없다.
 * </ul>
 */
@Service
public class MealCalorieFillService {

    private static final Logger log = LoggerFactory.getLogger(MealCalorieFillService.class);

    /** {@link AiJobService} 지표 태그 */
    private static final String JOB_LABEL = "meal-calorie-fill";

    /** 공공 DB 를 부를 이름 수 상한 — 앱(DietRecordScreen MAX_FOOD_DB_LOOKUPS)과 같다. 못 부른 이름은 AI 가 받는다 */
    static final int MAX_FOOD_DB_LOOKUPS = 4;

    private final MealRepository mealRepository;
    private final UserRepository userRepository;
    private final FoodAnalysisService foodAnalysisService;
    private final FoodDbClient foodDbClient;
    private final AiJobService aiJobService;
    private final TransactionTemplate newTransaction;

    public MealCalorieFillService(MealRepository mealRepository,
                                  UserRepository userRepository,
                                  FoodAnalysisService foodAnalysisService,
                                  FoodDbClient foodDbClient,
                                  AiJobService aiJobService,
                                  PlatformTransactionManager transactionManager) {
        this.mealRepository = mealRepository;
        this.userRepository = userRepository;
        this.foodAnalysisService = foodAnalysisService;
        this.foodDbClient = foodDbClient;
        this.aiJobService = aiJobService;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 항목 한 줄 — 접수 때 모습을 들고 다니며 "그사이 고쳤나"를 이 값의 동등성으로 본다 */
    record Row(String name, String portion, Integer calories, Integer carbs, Integer protein, Integer fat) {
        static Row of(MealItem i) {
            return new Row(i.getName(), i.getPortion(), i.getCalories(), i.getCarbs(), i.getProtein(), i.getFat());
        }

        boolean lacksCalories() {
            return calories == null && name != null && !name.isBlank();
        }
    }

    /** 채운 결과 한 줄 — {@code filled} 면 서버가 채운 값이라 데이트 식단에서 절반으로 나눈다 */
    record Planned(Row row, boolean filled) {
    }

    /** 방금 저장된 끼니가 대상이면 커밋 이후 백그라운드 작업을 건다. 아니면 아무것도 안 한다. */
    public void scheduleIfEligible(Long userId, Meal meal) {
        List<Row> snapshot = rowsOf(meal);
        if (snapshot.stream().noneMatch(Row::lacksCalories)) return;
        boolean enabled = userRepository.findById(userId).map(u -> u.isAutoAnalyzeMealPhoto()).orElse(false);
        if (!enabled) return;
        Long mealId = meal.getId();
        afterCommit(() -> aiJobService.submit(userId, JOB_LABEL, () -> fill(userId, mealId, snapshot)));
    }

    private Object fill(Long userId, Long mealId, List<Row> snapshot) {
        List<Integer> missing = new ArrayList<>();
        for (int i = 0; i < snapshot.size(); i++) {
            if (snapshot.get(i).lacksCalories()) missing.add(i);
        }

        Map<String, BarcodeLookupResponse> hits = lookupFoodDb(
                missing.stream().map(i -> snapshot.get(i).name()).toList());
        List<Integer> stillMissing = missing.stream()
                .filter(i -> !hits.containsKey(key(snapshot.get(i).name())))
                .toList();

        MealAnalysisResponse ai = null;
        if (!stillMissing.isEmpty()) {
            String text = stillMissing.stream().map(i -> describe(snapshot.get(i))).collect(Collectors.joining(", "));
            try {
                MealAnalysisResponse result = foodAnalysisService.analyzeText(userId, text);
                if (result.isFood() && !result.foods().isEmpty()) ai = result;
            } catch (RuntimeException e) {
                // 한도 소진·Gemini 실패 — 표기값으로 찾은 것만이라도 채운다
                log.info("칼로리 자동 채우기: AI 단계 건너뜀 (mealId={}): {}", mealId, e.getMessage());
            }
        }
        if (hits.isEmpty() && ai == null) {
            return Map.of("applied", false);
        }

        List<Planned> planned = plan(snapshot, hits, stillMissing, ai);
        boolean estimated = ai != null;
        Integer applied = newTransaction.execute(status -> apply(mealId, snapshot, planned, estimated));
        return Map.of("applied", applied != null && applied > 0, "meals", applied == null ? 0 : applied);
    }

    /**
     * 채운 뒤의 항목 목록 — 순수 계산이라 테스트가 직접 부른다.
     *
     * @param stillMissing 표기값으로 못 채워 AI 에 보낸 항목 위치(보낸 순서)
     * @param ai           AI 결과 — 없으면(못 불렀거나 실패) 그 항목들은 빈 채로 남는다
     */
    static List<Planned> plan(List<Row> snapshot, Map<String, BarcodeLookupResponse> hits,
                              List<Integer> stillMissing, MealAnalysisResponse ai) {
        boolean byOrder = ai != null && ai.foods().size() == stillMissing.size();
        List<Planned> out = new ArrayList<>();
        for (int i = 0; i < snapshot.size(); i++) {
            Row row = snapshot.get(i);
            if (!row.lacksCalories()) {
                out.add(new Planned(row, false));
                continue;
            }
            BarcodeLookupResponse hit = hits.get(key(row.name()));
            if (hit != null) {
                out.add(new Planned(new Row(row.name(), firstNonBlank(row.portion(), hit.servingSize()),
                        hit.calories(), or(row.carbs(), hit.carbs()), or(row.protein(), hit.protein()),
                        or(row.fat(), hit.fat())), true));
                continue;
            }
            if (ai == null) {
                out.add(new Planned(row, false));
                continue;
            }
            if (byOrder) {
                MealAnalysisResponse.AnalyzedFood f = ai.foods().get(stillMissing.indexOf(i));
                out.add(new Planned(new Row(row.name(), firstNonBlank(row.portion(), f.portion()),
                        f.calories(), or(row.carbs(), f.carbs()), or(row.protein(), f.protein()),
                        or(row.fat(), f.fat())), true));
            }
            // 개수가 다르면 이 줄은 빼고 아래에서 AI 가 나눈 목록을 붙인다
        }
        if (ai != null && !byOrder) {
            for (MealAnalysisResponse.AnalyzedFood f : ai.foods()) {
                out.add(new Planned(new Row(f.name(), f.portion(), f.calories(), f.carbs(), f.protein(), f.fat()), true));
            }
        }
        return out;
    }

    private int apply(Long mealId, List<Row> snapshot, List<Planned> planned, boolean estimated) {
        Meal meal = mealRepository.findById(mealId).orElse(null);
        if (meal == null) return 0;
        if (!rowsOf(meal).equals(snapshot)) {
            log.info("칼로리 자동 채우기 결과 폐기 — 기다리는 사이 사용자가 기록을 고쳤다 (mealId={})", mealId);
            return 0;
        }
        List<Meal> targets = meal.isSharedMeal()
                ? mealRepository.findBySharedGroupId(meal.getSharedGroupId())
                : List.of(meal);
        boolean halve = meal.isSharedMeal();
        int count = 0;
        for (Meal target : targets) {
            // 짝 기록을 상대가 따로 고쳤으면 그쪽은 두고 간다
            if (!rowsOf(target).equals(snapshot)) continue;
            target.applyFilledItems(toItems(planned, halve), estimated);
            count++;
        }
        mealRepository.saveAll(targets);
        return count;
    }

    private static List<MealItem> toItems(List<Planned> planned, boolean halve) {
        List<MealItem> items = new ArrayList<>();
        for (int i = 0; i < planned.size(); i++) {
            Planned p = planned.get(i);
            Row r = p.row();
            boolean cut = halve && p.filled();
            items.add(MealItem.builder()
                    .name(r.name())
                    .portion(r.portion())
                    .calories(cut ? Meal.half(r.calories()) : r.calories())
                    .carbs(cut ? Meal.half(r.carbs()) : r.carbs())
                    .protein(cut ? Meal.half(r.protein()) : r.protein())
                    .fat(cut ? Meal.half(r.fat()) : r.fat())
                    .orderNo(i)
                    .build());
        }
        return items;
    }

    /** 이름이 정확히 같은 표기값만 받는다 — 근사 매칭은 "신라면"에 엉뚱한 라면 값을 조용히 넣는다(앱과 같은 규칙) */
    private Map<String, BarcodeLookupResponse> lookupFoodDb(List<String> names) {
        Map<String, BarcodeLookupResponse> hits = new HashMap<>();
        if (names.isEmpty() || !foodDbClient.isConfigured()) return hits;
        for (String name : names.stream().map(String::trim).distinct().limit(MAX_FOOD_DB_LOOKUPS).toList()) {
            try {
                foodDbClient.search(name).stream()
                        .filter(r -> r.foodName() != null && key(r.foodName()).equals(key(name)) && r.calories() != null)
                        .findFirst()
                        .ifPresent(r -> hits.put(key(name), r));
            } catch (RuntimeException e) {
                // 공공 API 오류는 AI 로 이어가면 된다
                log.info("칼로리 자동 채우기: 식품 DB 조회 실패 '{}': {}", name, e.getMessage());
            }
        }
        return hits;
    }

    private static List<Row> rowsOf(Meal meal) {
        return meal.getItems().stream().map(Row::of).toList();
    }

    private static String describe(Row row) {
        return row.portion() == null || row.portion().isBlank()
                ? row.name().trim()
                : row.name().trim() + " " + row.portion().trim();
    }

    static String key(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }

    private static Integer or(Integer mine, Integer found) {
        return mine != null ? mine : found;
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }

    /** 커밋 이후 실행 — 트랜잭션 밖이면(테스트 등) 바로 실행한다(MealPhotoAutoAnalysisService 와 같다) */
    private static void afterCommit(Runnable action) {
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
