package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.plan.Plan;
import com.fitto.common.plan.Store;
import com.fitto.common.plan.Subscription;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.SubscriptionStatus;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealStatsResponse;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.NutritionService;
import com.fitto.chat.domain.MoodPack;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.service.MoodService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * PRO 상품성 — 심화 영양 통계({@code FULL_STATS})와 확장 꾸미기({@code PREMIUM_STICKER}).
 *
 * <p>무료 체험 플래그를 <b>끄고</b> 돈다 — 켜진 채(운영 기본값)로는 전원 PRO 라 게이팅
 * 분기 자체가 실행되지 않는다({@code CallPlanGatingTest} 와 같은 이유).
 */
@SpringBootTest(properties = "fitto.plan.free-trial=false")
@ActiveProfiles("test")
class DeepNutritionStatsTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MealService mealService;
    @Autowired MoodService moodService;
    @Autowired NutritionService nutritionService;
    @Autowired SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private void goPro(Long userId) {
        subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("doubly.pro.monthly")
                .purchaseToken("token-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());
    }

    private void logMeal(Long userId, LocalDate date, int calories, int protein) {
        mealService.save(userId, new SaveMealRequest(
                date, MealType.LUNCH, "점심", null, calories, 50, protein, 20,
                10, 900, 5, null));
    }

    /** 무료도 최근 7일은 본다 — 여기까지 막으면 기록할 이유가 사라진다. */
    @Test
    void 무료는_7일_요약만_보고_심화는_잠긴다() {
        Long user = register("deep-free@fitto.com");
        logMeal(user, KstClock.today(), 700, 40);

        MealStatsResponse stats = mealService.stats(user);

        assertThat(stats.last7Days()).hasSize(7);
        assertThat(stats.last7Days().get(6).protein()).isEqualTo(40);
        assertThat(stats.locked()).isTrue();
        assertThat(stats.deep()).isNull();
    }

    @Test
    void PRO는_30일_영양소와_목표치를_함께_받는다() {
        Long user = register("deep-pro@fitto.com");
        goPro(user);
        nutritionService.setGoal(user, new NutritionGoalRequest(2000, 250, 120, 60));
        LocalDate today = KstClock.today();
        logMeal(user, today, 700, 40);
        logMeal(user, today.minusDays(10), 800, 55);

        MealStatsResponse stats = mealService.stats(user);

        assertThat(stats.locked()).isFalse();
        assertThat(stats.deep()).isNotNull();
        // 기록이 없는 날도 0으로 채워 30칸이 다 온다 — 히트맵 격자가 비지 않도록
        assertThat(stats.deep().last30Days()).hasSize(30);
        assertThat(stats.deep().last30Days().get(29).protein()).isEqualTo(40);
        assertThat(stats.deep().last30Days().get(19).protein()).isEqualTo(55);
        assertThat(stats.deep().last30Days().get(0).calories()).isZero();
        assertThat(stats.deep().targets().protein()).isEqualTo(120);
        // 나트륨은 mg 단위 그대로 — 추이 그래프의 원본
        assertThat(stats.deep().last30Days().get(29).sodium()).isEqualTo(900);
    }

    /** 목표를 안 정한 사람은 달성률 대신 절대량만 본다 — 없는 목표를 지어내지 않는다. */
    @Test
    void 목표_미설정이면_targets_는_비어_온다() {
        Long user = register("deep-nogoal@fitto.com");
        goPro(user);
        logMeal(user, KstClock.today(), 700, 40);

        assertThat(mealService.stats(user).deep().targets()).isNull();
    }

    @Test
    void 확장_무드는_PRO_에서만_설정할_수_있다() {
        long[] free = couple("mood-free-a@fitto.com", "mood-free-b@fitto.com");
        String premiumMood = MoodPack.PREMIUM.get(0);

        assertThatThrownBy(() -> moodService.set(free[0], new MoodRequest(premiumMood, null)))
                .isInstanceOf(BusinessException.class);
        // 기본 무드는 그대로 무료
        assertThatCode(() -> moodService.set(free[0], new MoodRequest("😊", null)))
                .doesNotThrowAnyException();

        long[] pro = couple("mood-pro-a@fitto.com", "mood-pro-b@fitto.com");
        goPro(pro[0]);
        assertThatCode(() -> moodService.set(pro[1], new MoodRequest(premiumMood, null)))
                .doesNotThrowAnyException();   // 커플 단위 판정 — 한쪽만 PRO 여도 둘 다 쓴다
    }
}
