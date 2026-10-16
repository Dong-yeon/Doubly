package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.body.domain.BodyMetric;
import com.fitto.body.repository.BodyMetricRepository;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.FastingEndReason;
import com.fitto.diet.domain.FastingPlan;
import com.fitto.diet.domain.FastingSession;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.domain.WaterLog;
import com.fitto.diet.dto.HabitInsightsResponse;
import com.fitto.diet.dto.HabitInsightsResponse.Day;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.repository.FastingSessionRepository;
import com.fitto.diet.repository.WaterLogRepository;
import com.fitto.diet.service.HabitInsightService;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.WaterService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 물·단식 리포트(2026-10-16) — 날짜(KST) 맞대기, 주간 요약, 4주 비교, 체중, 커플 "둘 다 채운 날".
 * 기준일은 오늘(KST)로 두되, 단식 세션은 그 날짜에서 거꾸로 만들어 날짜 경계에 기대지 않는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class HabitInsightFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    HabitInsightService insightService;
    @Autowired
    FastingSessionRepository fastingRepository;
    @Autowired
    WaterLogRepository waterLogRepository;
    @Autowired
    BodyMetricRepository bodyMetricRepository;
    @Autowired
    MealService mealService;
    @Autowired
    WaterService waterService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private static LocalDateTime kst(LocalDate date, int hour) {
        return ZonedDateTime.of(date, LocalTime.of(hour, 0), KstClock.ZONE)
                .withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
    }

    /** endDay 아침 hourEnd 에 끝나는 단식(전날 20시 시작) */
    private void fastEndingOn(Long user, LocalDate endDay, int hours, int lastedHours) {
        LocalDateTime start = kst(endDay.minusDays(1), 20);
        FastingSession s = fastingRepository.save(FastingSession.builder()
                .userId(user).planType(FastingPlan.CUSTOM).targetHours(hours).startedAt(start).build());
        s.end(start.plusHours(lastedHours), FastingEndReason.MEAL);
        fastingRepository.save(s);
    }

    private void meal(Long user, LocalDate date, int kcal) {
        mealService.save(user, new SaveMealRequest(date, MealType.LUNCH, "t", null, kcal, null, null, null,
                null, null, null, null, false, null));
    }

    private void water(Long user, LocalDate date, int ml) {
        waterLogRepository.save(WaterLog.builder().userId(user).logDate(date).amountMl(ml).build());
    }

    private Day dayOf(HabitInsightsResponse r, LocalDate d) {
        return r.days().stream().filter(x -> x.date().equals(d)).findFirst().orElseThrow();
    }

    @Test
    void 기록이_하나도_없으면_빈_28일과_0_요약이다() {
        Long user = register("hab-empty@fitto.com");
        LocalDate today = KstClock.today();

        HabitInsightsResponse r = insightService.insights(user, today);

        assertThat(r.days()).hasSize(28);
        assertThat(r.days().get(0).date()).isEqualTo(today.minusDays(27));
        assertThat(r.days().get(27).date()).isEqualTo(today);
        assertThat(r.waterTargetMl()).isEqualTo(2000);
        assertThat(r.thisWeek().fastCount()).isZero();
        assertThat(r.thisWeek().avgFastMin()).isNull();
        assertThat(r.comparison().enough()).isFalse();
        assertThat(r.comparison().weightChangeKg()).isNull();
        assertThat(r.lastFast()).isNull();
        assertThat(r.achievedStreak()).isZero();
        assertThat(r.couple().connected()).isFalse();
        assertThat(r.days().get(27).partnerAchieved()).isNull();
    }

    @Test
    void 단식은_끝난_날에_붙고_주간_요약과_연속_달성을_센다() {
        Long user = register("hab-week@fitto.com");
        LocalDate today = KstClock.today();
        fastEndingOn(user, today, 16, 17);               // 오늘 끝, 달성
        fastEndingOn(user, today.minusDays(1), 16, 16);   // 어제, 딱 달성
        fastEndingOn(user, today.minusDays(2), 16, 10);   // 그제, 미달
        fastEndingOn(user, today.minusDays(9), 16, 18);   // 지난주 구간
        // 진행 중 단식은 날짜 표에 안 들어간다
        fastingRepository.save(FastingSession.builder().userId(user).planType(FastingPlan.SIXTEEN_EIGHT)
                .targetHours(16).startedAt(LocalDateTime.now().minusHours(1)).build());

        HabitInsightsResponse r = insightService.insights(user, today);

        assertThat(dayOf(r, today).fastMin()).isEqualTo(17 * 60);
        assertThat(dayOf(r, today).fastAchieved()).isTrue();
        assertThat(dayOf(r, today.minusDays(2)).fastAchieved()).isFalse();
        assertThat(r.thisWeek().fastCount()).isEqualTo(3);
        assertThat(r.thisWeek().achievedCount()).isEqualTo(2);
        assertThat(r.thisWeek().avgFastMin()).isEqualTo((17 + 16 + 10) * 60 / 3);
        assertThat(r.lastWeek().fastCount()).isEqualTo(1);
        assertThat(r.achievedStreak()).isEqualTo(2);
        assertThat(r.lastFast().elapsedMin()).isEqualTo(17 * 60);
        assertThat(r.lastFast().achieved()).isTrue();
        assertThat(r.lastFast().achievedThisWeek()).isEqualTo(2);
    }

    @Test
    void 오늘_아직_달성이_없으면_어제부터_연속을_센다() {
        Long user = register("hab-streak@fitto.com");
        LocalDate today = KstClock.today();
        fastEndingOn(user, today.minusDays(1), 16, 16);
        fastEndingOn(user, today.minusDays(2), 16, 16);
        fastEndingOn(user, today.minusDays(4), 16, 16); // 사흘 전 빠짐 → 끊김

        assertThat(insightService.insights(user, today).achievedStreak()).isEqualTo(2);
    }

    @Test
    void 기간_밖_단식은_빠지고_경계_날짜는_들어간다() {
        Long user = register("hab-range@fitto.com");
        LocalDate today = KstClock.today();
        fastEndingOn(user, today.minusDays(27), 16, 16); // 첫날 — 들어간다
        fastEndingOn(user, today.minusDays(28), 16, 16); // 하루 넘음 — 빠진다

        HabitInsightsResponse r = insightService.insights(user, today);

        assertThat(dayOf(r, today.minusDays(27)).fastAchieved()).isTrue();
        assertThat(r.days().stream().filter(Day::fastAchieved).count()).isEqualTo(1);
    }

    @Test
    void 물은_날짜별로_싣고_목표는_지금_값으로_잰다() {
        Long user = register("hab-water@fitto.com");
        LocalDate today = KstClock.today();
        waterService.setGoal(user, 1500);
        water(user, today.minusDays(1), 1500);
        water(user, today.minusDays(2), 1499);
        water(user, today.minusDays(3), 3000);

        HabitInsightsResponse r = insightService.insights(user, today);

        assertThat(r.waterTargetMl()).isEqualTo(1500);
        assertThat(dayOf(r, today.minusDays(2)).waterMl()).isEqualTo(1499);
        assertThat(r.thisWeek().waterGoalDays()).isEqualTo(2);
        assertThat(r.thisWeek().avgWaterMl()).isEqualTo(Math.round((1500 + 1499 + 3000) / 7f));
    }

    @Test
    void 단식한_날과_안_한_날의_칼로리를_각_3일_이상일_때만_비교한다() {
        Long user = register("hab-compare@fitto.com");
        LocalDate today = KstClock.today();
        for (int i = 1; i <= 3; i++) {
            fastEndingOn(user, today.minusDays(i), 16, 16);
            meal(user, today.minusDays(i), 1500);
        }
        meal(user, today.minusDays(4), 2100);
        meal(user, today.minusDays(5), 2200);
        // 칼로리 없는 날은 비교에서 빠진다(0kcal 과 다르다)
        fastEndingOn(user, today.minusDays(6), 16, 16);

        HabitInsightsResponse r1 = insightService.insights(user, today);
        assertThat(r1.comparison().enough()).isFalse();
        assertThat(r1.comparison().fastDays()).isEqualTo(3);
        assertThat(r1.comparison().otherDays()).isEqualTo(2);
        assertThat(dayOf(r1, today.minusDays(6)).calories()).isNull();

        meal(user, today.minusDays(7), 2300);
        HabitInsightsResponse r2 = insightService.insights(user, today);
        assertThat(r2.comparison().enough()).isTrue();
        assertThat(r2.comparison().fastDayAvgCalories()).isEqualTo(1500);
        assertThat(r2.comparison().otherDayAvgCalories()).isEqualTo(2200);
    }

    @Test
    void 체중은_그날_마지막_값이고_변화는_첫_값과_마지막_값의_차이다() {
        Long user = register("hab-weight@fitto.com");
        LocalDate today = KstClock.today();
        bodyMetricRepository.save(BodyMetric.builder().userId(user).measuredDate(today.minusDays(20)).weightKg(new BigDecimal("62.40")).build());
        bodyMetricRepository.save(BodyMetric.builder().userId(user).measuredDate(today.minusDays(3)).weightKg(new BigDecimal("61.90")).build());
        bodyMetricRepository.save(BodyMetric.builder().userId(user).measuredDate(today.minusDays(3)).weightKg(new BigDecimal("61.50")).build());
        // 체중 없는 기록(허리만)·기간 밖은 무시
        bodyMetricRepository.save(BodyMetric.builder().userId(user).measuredDate(today.minusDays(1)).waistCm(new BigDecimal("70.0")).build());
        bodyMetricRepository.save(BodyMetric.builder().userId(user).measuredDate(today.minusDays(40)).weightKg(new BigDecimal("70.00")).build());

        HabitInsightsResponse r = insightService.insights(user, today);

        assertThat(dayOf(r, today.minusDays(3)).weightKg()).isEqualByComparingTo("61.50");
        assertThat(dayOf(r, today.minusDays(1)).weightKg()).isNull();
        assertThat(r.comparison().weightCount()).isEqualTo(2);
        assertThat(r.comparison().weightChangeKg()).isEqualByComparingTo("-0.90");
    }

    @Test
    void 커플은_둘_다_채운_날과_연속을_세고_상대_체중은_싣지_않는다() {
        Long a = register("hab-couple-a@fitto.com");
        Long b = register("hab-couple-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        LocalDate today = KstClock.today();
        for (int i = 1; i <= 3; i++) fastEndingOn(a, today.minusDays(i), 16, 16);
        fastEndingOn(b, today.minusDays(1), 16, 16);
        fastEndingOn(b, today.minusDays(2), 16, 16);
        fastEndingOn(b, today.minusDays(5), 16, 16);
        bodyMetricRepository.save(BodyMetric.builder().userId(b).measuredDate(today.minusDays(1)).weightKg(new BigDecimal("55.00")).build());

        HabitInsightsResponse r = insightService.insights(a, today);

        assertThat(r.couple().connected()).isTrue();
        assertThat(r.couple().bothDays()).isEqualTo(2);
        assertThat(r.couple().bothStreak()).isEqualTo(2);
        assertThat(dayOf(r, today.minusDays(5)).partnerAchieved()).isTrue();
        assertThat(dayOf(r, today.minusDays(3)).partnerAchieved()).isFalse();
        // 상대 체중은 내 날짜 표에 섞이지 않는다
        assertThat(r.days().stream().filter(d -> d.weightKg() != null).count()).isZero();
    }
}
