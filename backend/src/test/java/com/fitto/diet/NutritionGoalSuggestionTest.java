package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.UpdateProfileRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.service.BodyMetricService;
import com.fitto.diet.domain.ActivityLevel;
import com.fitto.diet.domain.DietGoalType;
import com.fitto.diet.dto.NutritionGoalSuggestionRequest;
import com.fitto.diet.dto.NutritionGoalSuggestionResponse;
import com.fitto.diet.service.NutritionService;
import com.fitto.user.domain.Gender;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** 목표 칼로리 자동 계산(TDEE 마법사) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class NutritionGoalSuggestionTest {

    @Autowired
    AuthService authService;
    @Autowired
    BodyMetricService bodyMetricService;
    @Autowired
    NutritionService nutritionService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 프로필이_없으면_계산하지_못하고_안내_메시지를_준다() {
        Long user = register("ngs1@fitto.com");

        NutritionGoalSuggestionResponse res = nutritionService.suggestGoal(user,
                new NutritionGoalSuggestionRequest(ActivityLevel.MODERATE, DietGoalType.MAINTAIN, null));

        assertThat(res.targetCalories()).isNull();
        assertThat(res.message()).isNotBlank();
    }

    @Test
    void 유지_목표는_TDEE와_같다() {
        Long user = register("ngs2@fitto.com");
        authService.updateMe(user, new UpdateProfileRequest(null, null, LocalDate.of(1995, 1, 1), Gender.MALE, 175));
        bodyMetricService.save(user, new SaveBodyMetricRequest(LocalDate.now(), new BigDecimal("70.0"), null, null, null, null));

        NutritionGoalSuggestionResponse res = nutritionService.suggestGoal(user,
                new NutritionGoalSuggestionRequest(ActivityLevel.MODERATE, DietGoalType.MAINTAIN, null));

        assertThat(res.bmr()).isNotNull();
        assertThat(res.tdee()).isEqualTo((int) Math.round(res.bmr() * ActivityLevel.MODERATE.multiplier()));
        assertThat(res.targetCalories()).isEqualTo(res.tdee());
    }

    @Test
    void 감량_목표는_TDEE보다_낮고_증량_목표는_TDEE보다_높다() {
        Long user = register("ngs3@fitto.com");
        authService.updateMe(user, new UpdateProfileRequest(null, null, LocalDate.of(1995, 1, 1), Gender.FEMALE, 160));
        bodyMetricService.save(user, new SaveBodyMetricRequest(LocalDate.now(), new BigDecimal("60.0"), null, null, null, null));

        NutritionGoalSuggestionResponse lose = nutritionService.suggestGoal(user,
                new NutritionGoalSuggestionRequest(ActivityLevel.LIGHT, DietGoalType.LOSE, 0.5));
        NutritionGoalSuggestionResponse gain = nutritionService.suggestGoal(user,
                new NutritionGoalSuggestionRequest(ActivityLevel.LIGHT, DietGoalType.GAIN, 0.5));

        assertThat(lose.targetCalories()).isLessThan(lose.tdee());
        assertThat(gain.targetCalories()).isGreaterThan(gain.tdee());
        // 체중 60kg × 1.8g/kg 단백질 목표가 매크로에 반영된다
        assertThat(lose.targetProtein()).isEqualTo((int) Math.round(60.0 * 1.8));
    }

    @Test
    void 극단적_저칼로리로는_내려가지_않는다() {
        Long user = register("ngs4@fitto.com");
        authService.updateMe(user, new UpdateProfileRequest(null, null, LocalDate.of(1995, 1, 1), Gender.FEMALE, 150));
        bodyMetricService.save(user, new SaveBodyMetricRequest(LocalDate.now(), new BigDecimal("45.0"), null, null, null, null));

        // 활동량 최소 + 감량 속도 최대로 밀어붙여도 절대 하한(1200) 아래로 내려가지 않는다
        NutritionGoalSuggestionResponse res = nutritionService.suggestGoal(user,
                new NutritionGoalSuggestionRequest(ActivityLevel.SEDENTARY, DietGoalType.LOSE, 1.5));

        assertThat(res.targetCalories()).isGreaterThanOrEqualTo(1200);
    }
}
