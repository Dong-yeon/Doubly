package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.UpdateProfileRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.service.BodyMetricService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.NutritionSummaryResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.NutritionService;
import com.fitto.user.domain.Gender;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 실시간 에너지 밸런스(BMR + 운동 소모 - 섭취) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class EnergyBalanceTest {

    @Autowired
    AuthService authService;
    @Autowired
    BodyMetricService bodyMetricService;
    @Autowired
    WorkoutService workoutService;
    @Autowired
    MealService mealService;
    @Autowired
    NutritionService nutritionService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 프로필과_체중이_없으면_bmr은_null이다() {
        Long user = register("e1@fitto.com");

        NutritionSummaryResponse summary = nutritionService.today(user);

        assertThat(summary.bmr()).isNull();
        assertThat(summary.energyBalance()).isNull();
        assertThat(summary.exerciseCalories()).isZero();
    }

    @Test
    void 키_생년월일_성별_체중이_모두_있으면_bmr을_계산한다() {
        Long user = register("e2@fitto.com");
        authService.updateMe(user, new UpdateProfileRequest(null, null, LocalDate.of(1995, 1, 1), Gender.MALE, 175));
        bodyMetricService.save(user, new SaveBodyMetricRequest(LocalDate.now(), new BigDecimal("70.0"), null, null, null, null));

        NutritionSummaryResponse summary = nutritionService.today(user);

        // Mifflin-St Jeor(남): 10*70 + 6.25*175 - 5*age + 5
        assertThat(summary.bmr()).isNotNull();
        assertThat(summary.bmr()).isGreaterThan(1400).isLessThan(1900);
    }

    @Test
    void 오늘_운동_시간이_있으면_운동_소모_칼로리가_에너지_밸런스에_반영된다() {
        Long user = register("e3@fitto.com");
        authService.updateMe(user, new UpdateProfileRequest(null, null, LocalDate.of(1995, 1, 1), Gender.FEMALE, 160));
        bodyMetricService.save(user, new SaveBodyMetricRequest(LocalDate.now(), new BigDecimal("55.0"), null, null, null, null));
        workoutService.save(user, new SaveWorkoutRequest(LocalDate.now(), null, 60, "가슴",
                List.of(new WorkoutSetRequest("벤치프레스", "가슴", 3, 10, new BigDecimal("40"), 1))));

        NutritionSummaryResponse before = nutritionService.today(user);
        assertThat(before.exerciseCalories()).isGreaterThan(0);
        assertThat(before.energyBalance()).isEqualTo(before.bmr() + before.exerciseCalories());

        mealService.save(user, new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "닭가슴살", null, 500, null, null, null));
        NutritionSummaryResponse after = nutritionService.today(user);
        assertThat(after.energyBalance()).isEqualTo(before.energyBalance() - 500);
    }
}
