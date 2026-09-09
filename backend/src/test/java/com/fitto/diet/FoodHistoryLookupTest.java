package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.FoodLookupRequest;
import com.fitto.diet.dto.FoodLookupResponse;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.RecentFoodResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 내 기록에서 음식 영양 정보 찾기(food-lookup) + 항목 기반 "최근 먹은 음식" — H2 기반.
 * 즐겨찾기·추천 칩처럼 칼로리 없이 들어온 음식을 과거에 계산한 값으로 채우는 경로.
 */
@SpringBootTest
@ActiveProfiles("test")
class FoodHistoryLookupTest {

    @Autowired
    AuthService authService;
    @Autowired
    MealService mealService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private SaveMealRequest meal(LocalDate date, String memo, MealItemRequest... items) {
        return new SaveMealRequest(date, MealType.LUNCH, memo, null, null, null, null, null, null, null, null, List.of(items));
    }

    @Test
    void 이름으로_찾으면_칼로리가_있는_가장_최근_기록값을_돌려주고_없는_이름은_빠진다() {
        Long user = register("fl1@fitto.com");
        LocalDate d = LocalDate.of(2026, 9, 1);
        mealService.save(user, meal(d, null, new MealItemRequest("닭가슴살", "100g", 165, 0, 31, 4)));
        mealService.save(user, meal(d.plusDays(1), null, new MealItemRequest("닭가슴살", "150g", 250, 0, 46, 6)));
        // 가장 최근이지만 칼로리가 없는 기록은 대표값이 될 수 없다
        mealService.save(user, meal(d.plusDays(2), null, new MealItemRequest("닭가슴살", null, null, null, null, null)));

        List<FoodLookupResponse> found = mealService.lookupFoods(user,
                new FoodLookupRequest(List.of("닭가슴살", "처음 먹는 음식")));

        assertThat(found).hasSize(1);
        FoodLookupResponse chicken = found.get(0);
        assertThat(chicken.name()).isEqualTo("닭가슴살");
        assertThat(chicken.calories()).isEqualTo(250);
        assertThat(chicken.portion()).isEqualTo("150g");
        assertThat(chicken.protein()).isEqualTo(46);
    }

    @Test
    void 이름_비교는_공백과_대소문자를_무시하고_요청한_이름_그대로_돌려준다() {
        Long user = register("fl2@fitto.com");
        mealService.save(user, meal(LocalDate.of(2026, 9, 1), null, new MealItemRequest("Protein Shake", null, 120, 5, 24, 1)));

        List<FoodLookupResponse> found = mealService.lookupFoods(user,
                new FoodLookupRequest(List.of(" protein shake ")));

        assertThat(found).hasSize(1);
        assertThat(found.get(0).name()).isEqualTo(" protein shake ");
        assertThat(found.get(0).calories()).isEqualTo(120);
    }

    @Test
    void 다른_사용자의_기록은_보이지_않는다() {
        Long me = register("fl3a@fitto.com");
        Long other = register("fl3b@fitto.com");
        mealService.save(other, meal(LocalDate.of(2026, 9, 1), null, new MealItemRequest("고구마", null, 130, 30, 2, 0)));

        assertThat(mealService.lookupFoods(me, new FoodLookupRequest(List.of("고구마")))).isEmpty();
    }

    @Test
    void 최근_먹은_음식은_메모가_아니라_음식_항목에서_뽑히고_빈도순이다() {
        Long user = register("fl4@fitto.com");
        LocalDate d = LocalDate.of(2026, 9, 1);
        mealService.save(user, meal(d, "오늘 좀 짰음",
                new MealItemRequest("공기밥", "1공기", 300, 90, 6, 1),
                new MealItemRequest("김치", null, 20, 3, 1, 0)));
        mealService.save(user, meal(d.plusDays(1), "맛있었다",
                new MealItemRequest("공기밥", "반 공기", 150, 45, 3, 0)));

        List<RecentFoodResponse> recent = mealService.recentFoods(user);

        assertThat(recent).extracting(RecentFoodResponse::name).containsExactly("공기밥", "김치");
        assertThat(recent).extracting(RecentFoodResponse::name).doesNotContain("오늘 좀 짰음", "맛있었다");
        assertThat(recent.get(0).count()).isEqualTo(2);
        assertThat(recent.get(0).calories()).isEqualTo(150); // 가장 최근 값이 대표
    }
}
