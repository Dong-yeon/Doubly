package com.fitto.diet.service;

import com.fitto.body.domain.BodyMetric;
import com.fitto.body.repository.BodyMetricRepository;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.FastingSession;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.domain.WaterLog;
import com.fitto.diet.dto.HabitInsightsResponse;
import com.fitto.diet.dto.HabitInsightsResponse.Comparison;
import com.fitto.diet.dto.HabitInsightsResponse.Couple;
import com.fitto.diet.dto.HabitInsightsResponse.Day;
import com.fitto.diet.dto.HabitInsightsResponse.LastFast;
import com.fitto.diet.dto.HabitInsightsResponse.Week;
import com.fitto.diet.repository.FastingSessionRepository;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.diet.repository.WaterLogRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 물·단식 리포트 — 단식 이력·물·식단 칼로리·체중을 날짜(KST)로 맞대어 한 번에 준다(무료, 2026-10-16 결정).
 *
 * <p>"변화"는 몸속 추정이 아니라 사용자 본인 기록의 비교다. 단식한 날과 안 한 날의 칼로리 차이는 <b>관찰된 차이</b>일 뿐
 * 원인이 아니며, 화면도 그렇게 말한다. 체중은 본인에게만 — 커플 쪽에는 "둘 다 목표를 채운 날"만 나간다.
 */
@Service
@Transactional(readOnly = true)
public class HabitInsightService {

    /** 리포트 기간 — 4주. 주간 요약(7일 + 그 앞 7일)과 4주 비교가 모두 이 안에 있다 */
    static final int DAYS = 28;
    private static final int DEFAULT_TARGET_ML = 2000;

    private final FastingSessionRepository fastingRepository;
    private final WaterLogRepository waterLogRepository;
    private final MealRepository mealRepository;
    private final BodyMetricRepository bodyMetricRepository;
    private final NutritionGoalRepository nutritionGoalRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;

    public HabitInsightService(FastingSessionRepository fastingRepository, WaterLogRepository waterLogRepository,
                               MealRepository mealRepository, BodyMetricRepository bodyMetricRepository,
                               NutritionGoalRepository nutritionGoalRepository, RelationRepository relationRepository,
                               UserRepository userRepository) {
        this.fastingRepository = fastingRepository;
        this.waterLogRepository = waterLogRepository;
        this.mealRepository = mealRepository;
        this.bodyMetricRepository = bodyMetricRepository;
        this.nutritionGoalRepository = nutritionGoalRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
    }

    public HabitInsightsResponse insights(Long userId) {
        return insights(userId, KstClock.today());
    }

    /** 기준일을 받는 형태 — 날짜 경계를 테스트가 실제 날짜에 의존하지 않고 검증한다. */
    public HabitInsightsResponse insights(Long userId, LocalDate today) {
        LocalDate from = today.minusDays(DAYS - 1);
        int target = nutritionGoalRepository.findById(userId)
                .map(NutritionGoal::getTargetWaterMl).filter(Objects::nonNull).orElse(DEFAULT_TARGET_ML);

        Map<LocalDate, FastDay> myFasts = fastDays(userId, from, today);
        Map<LocalDate, Integer> water = waterLogRepository.findByUserIdAndLogDateBetween(userId, from, today).stream()
                .collect(Collectors.toMap(WaterLog::getLogDate, WaterLog::getAmountMl, Integer::sum));
        Map<LocalDate, Integer> calories = new HashMap<>();
        for (Meal m : mealRepository.findByUserIdAndMealDateBetween(userId, from, today)) {
            if (m.getCalories() != null) {
                calories.merge(m.getMealDate(), m.getCalories(), Integer::sum);
            }
        }
        Map<LocalDate, BigDecimal> weights = new HashMap<>();
        for (BodyMetric b : bodyMetricRepository.findByUserIdAndMeasuredDateBetweenOrderByMeasuredDateAscIdAsc(userId, from, today)) {
            if (b.getWeightKg() != null) {
                weights.put(b.getMeasuredDate(), b.getWeightKg()); // 시간순이라 그날 마지막 값이 남는다
            }
        }

        // 커플 — 상대의 "목표 채운 날"만 쓴다(상대 체중·칼로리는 보지 않는다)
        Optional<Relation> couple = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE).stream().findFirst();
        Long partnerId = couple.map(c -> c.partnerOf(userId)).orElse(null);
        Set<LocalDate> partnerAchieved = partnerId == null ? Set.of()
                : fastDays(partnerId, from, today).entrySet().stream()
                .filter(e -> e.getValue().achieved).map(Map.Entry::getKey).collect(Collectors.toSet());

        List<Day> days = new ArrayList<>(DAYS);
        for (LocalDate d = from; !d.isAfter(today); d = d.plusDays(1)) {
            FastDay f = myFasts.get(d);
            days.add(new Day(d, water.getOrDefault(d, 0),
                    f == null ? null : f.maxMin, f != null && f.achieved,
                    calories.get(d), weights.get(d),
                    partnerId == null ? null : partnerAchieved.contains(d)));
        }

        Week thisWeek = week(days.subList(DAYS - 7, DAYS), myFasts, target);
        Week lastWeek = week(days.subList(DAYS - 14, DAYS - 7), myFasts, target);
        Comparison comparison = compare(days);
        int streak = streak(today, d -> myFasts.containsKey(d) && myFasts.get(d).achieved);

        Couple coupleSummary = Couple.none();
        if (partnerId != null) {
            String partnerName = userRepository.findById(partnerId).map(u -> u.getName()).orElse(null);
            int both = (int) days.stream().filter(d -> d.fastAchieved() && Boolean.TRUE.equals(d.partnerAchieved())).count();
            int bothStreak = streak(today, d -> myFasts.containsKey(d) && myFasts.get(d).achieved && partnerAchieved.contains(d));
            coupleSummary = new Couple(true, partnerName, both, bothStreak);
        }

        return new HabitInsightsResponse(today, target, days, thisWeek, lastWeek, comparison,
                lastFast(userId, today), streak, coupleSummary);
    }

    /** 끝난 단식을 끝난 날(KST)로 모은다. 기간 경계에 걸친 단식을 놓치지 않게 시작 기준으로 이틀 더 거슬러 받는다. */
    private Map<LocalDate, FastDay> fastDays(Long userId, LocalDate from, LocalDate to) {
        LocalDateTime fromServer = from.minusDays(3).atStartOfDay(KstClock.ZONE)
                .withZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDateTime();
        Map<LocalDate, FastDay> out = new HashMap<>();
        for (FastingSession s : fastingRepository.findByUserIdAndStartedAtGreaterThanEqualOrderByStartedAtDesc(userId, fromServer)) {
            if (s.getEndedAt() == null) {
                continue;
            }
            LocalDate day = FastingService.toKst(s.getEndedAt()).toLocalDate();
            if (day.isBefore(from) || day.isAfter(to)) {
                continue;
            }
            int min = (int) Math.max(0, Duration.between(s.getStartedAt(), s.getEndedAt()).toMinutes());
            out.computeIfAbsent(day, k -> new FastDay()).add(min, min >= s.getTargetHours() * 60);
        }
        return out;
    }

    private static Week week(List<Day> days, Map<LocalDate, FastDay> fasts, int target) {
        int fastCount = 0, achieved = 0, totalMin = 0;
        for (Day d : days) {
            FastDay f = fasts.get(d.date());
            if (f != null) {
                fastCount += f.count;
                achieved += f.achievedCount;
                totalMin += f.totalMin;
            }
        }
        int waterGoalDays = (int) days.stream().filter(d -> d.waterMl() >= target).count();
        int avgWater = (int) Math.round(days.stream().mapToInt(Day::waterMl).average().orElse(0));
        return new Week(fastCount, achieved, fastCount == 0 ? null : Math.round((float) totalMin / fastCount),
                waterGoalDays, avgWater);
    }

    private static Comparison compare(List<Day> days) {
        List<Integer> fast = new ArrayList<>(), other = new ArrayList<>();
        for (Day d : days) {
            if (d.calories() == null) continue;
            (d.fastAchieved() ? fast : other).add(d.calories());
        }
        List<Day> weighed = days.stream().filter(d -> d.weightKg() != null).toList();
        BigDecimal change = weighed.size() < 2 ? null
                : weighed.get(weighed.size() - 1).weightKg().subtract(weighed.get(0).weightKg());
        boolean enough = fast.size() >= Comparison.MIN_DAYS && other.size() >= Comparison.MIN_DAYS;
        return new Comparison(enough, fast.size(), avg(fast), other.size(), avg(other), weighed.size(), change);
    }

    private LastFast lastFast(Long userId, LocalDate today) {
        return fastingRepository.findFirstByUserIdAndEndedAtIsNotNullOrderByEndedAtDesc(userId)
                .map(s -> {
                    int min = (int) Math.max(0, Duration.between(s.getStartedAt(), s.getEndedAt()).toMinutes());
                    boolean achieved = min >= s.getTargetHours() * 60;
                    int nth = 0;
                    if (achieved) {
                        // 이 단식을 포함해, 최근 7일 안에 끝난 달성 단식 중 몇 번째인가
                        LocalDate weekFrom = today.minusDays(6);
                        LocalDate endDay = FastingService.toKst(s.getEndedAt()).toLocalDate();
                        nth = (int) fastingRepository.findByUserIdAndStartedAtGreaterThanEqualOrderByStartedAtDesc(
                                        userId, s.getStartedAt().minusDays(9)).stream()
                                .filter(o -> o.getEndedAt() != null && !o.getEndedAt().isAfter(s.getEndedAt()))
                                .filter(o -> {
                                    LocalDate d = FastingService.toKst(o.getEndedAt()).toLocalDate();
                                    return !d.isBefore(weekFrom) && !d.isAfter(endDay);
                                })
                                .filter(o -> Duration.between(o.getStartedAt(), o.getEndedAt()).toMinutes() >= o.getTargetHours() * 60L)
                                .count();
                    }
                    return new LastFast(min, s.getTargetHours(), achieved, s.getEndedAt(), s.getEndedBy(), nth);
                })
                .orElse(null);
    }

    /** 오늘부터 거꾸로 이어지는 날 수 — 오늘이 아직 아니면 어제부터 센다(하루가 끝나지 않았으니 끊긴 게 아니다) */
    private static int streak(LocalDate today, java.util.function.Predicate<LocalDate> hit) {
        LocalDate d = hit.test(today) ? today : today.minusDays(1);
        int n = 0;
        while (n < DAYS && hit.test(d)) {
            n++;
            d = d.minusDays(1);
        }
        return n;
    }

    private static Integer avg(List<Integer> xs) {
        return xs.isEmpty() ? null : (int) Math.round(xs.stream().mapToInt(Integer::intValue).average().orElse(0));
    }

    private static final class FastDay {
        int count, achievedCount, totalMin, maxMin;
        boolean achieved;

        void add(int min, boolean ok) {
            count++;
            totalMin += min;
            maxMin = Math.max(maxMin, min);
            if (ok) {
                achievedCount++;
                achieved = true;
            }
        }
    }
}
