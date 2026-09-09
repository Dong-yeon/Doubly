package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.domain.NutritionSource;
import com.fitto.diet.dto.MealAnalysisResponse;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.FoodAnalysisService;
import com.fitto.diet.service.MealService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

/**
 * 사진만 올려 저장한 끼니의 백그라운드 자동 분석 —
 * {@code docs/DIET_USAGE_ANALYSIS_2026-09-09.md} 5절.
 *
 * <p>Gemini 호출({@link FoodAnalysisService})만 대역으로 바꾸고 나머지는 실제 경로를 탄다 —
 * 이 기능의 핵심은 프롬프트가 아니라 <b>언제 돌고 언제 안 도는가</b>와 <b>결과를 어디에
 * 어떻게 쓰는가</b>이기 때문이다.
 *
 * <p>분석은 커밋 이후 별도 스레드에서 돌므로 단언은 {@code await} 로 기다린다.
 */
@SpringBootTest
@ActiveProfiles("test")
class MealPhotoAutoAnalysisTest {

    private static final Duration ANALYZED = Duration.ofSeconds(5);

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MealService mealService;
    @Autowired UserRepository userRepository;

    @MockitoBean FoodAnalysisService foodAnalysisService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    /** 김치찌개 500kcal + 공기밥 300kcal = 800kcal */
    private MealAnalysisResponse twoFoods() {
        return new MealAnalysisResponse(true, List.of(
                new MealAnalysisResponse.AnalyzedFood("김치찌개", 500, "1인분", 30, 25, 30, 6, 1200, 4, null),
                new MealAnalysisResponse.AnalyzedFood("공기밥", 300, "1공기", 90, 6, 1, 0, 5, 1, null)),
                800, 120, 31, 31, 6, 1205, 5, "든든한 한 끼예요", "PHOTO_FOOD");
    }

    private SaveMealRequest photoOnly(boolean shared) {
        return new SaveMealRequest(LocalDate.now(), MealType.LUNCH, null,
                "https://res.cloudinary.com/demo/image/upload/lunch.jpg",
                null, null, null, null, null, null, null, null, shared);
    }

    @Test
    void 사진만_올려_저장하면_백그라운드_분석이_칼로리를_채운다() {
        Long user = register("auto1@fitto.com");
        when(foodAnalysisService.analyze(anyLong(), any())).thenReturn(twoFoods());

        MealResponse saved = mealService.save(user, photoOnly(false));
        // 저장 응답은 분석을 기다리지 않는다 — 그게 이 설계의 요점이다
        assertThat(saved.calories()).isNull();

        await().atMost(ANALYZED).untilAsserted(() -> {
            MealResponse after = mealService.findToday(user).get(0);
            assertThat(after.calories()).isEqualTo(800);
            assertThat(after.items()).extracting(i -> i.name())
                    .containsExactly("김치찌개", "공기밥");
            assertThat(after.sodium()).isEqualTo(1205);
            assertThat(after.nutritionSource()).isEqualTo(NutritionSource.AI_ESTIMATED);
        });
    }

    @Test
    void 사용자가_직접_적은_기록은_분석하지_않는다() {
        Long user = register("auto2@fitto.com");

        mealService.save(user, new SaveMealRequest(LocalDate.now(), MealType.DINNER, null,
                "https://res.cloudinary.com/demo/image/upload/dinner.jpg",
                null, null, null, null, null, null, null,
                List.of(new MealItemRequest("샐러드", "1인분", 200, 10, 5, 8))));

        verify(foodAnalysisService, never()).analyze(anyLong(), any());
    }

    @Test
    void 설정을_끄면_사진을_올려도_분석하지_않는다() {
        Long user = register("auto3@fitto.com");
        User entity = userRepository.findById(user).orElseThrow();
        entity.setAutoAnalyzeMealPhoto(false);
        userRepository.save(entity);

        mealService.save(user, photoOnly(false));

        verify(foodAnalysisService, never()).analyze(anyLong(), any());
    }

    @Test
    void 사진이_없으면_분석하지_않는다() {
        Long user = register("auto4@fitto.com");

        mealService.save(user, new SaveMealRequest(LocalDate.now(), MealType.SNACK, "그냥 메모만",
                null, null, null, null, null, null, null, null, null));

        verify(foodAnalysisService, never()).analyze(anyLong(), any());
    }

    /**
     * 데이트 식단은 사진 한 장이 둘이 먹은 상을 찍은 것이다 — 저장 시점에 절반씩 나눠 담기로
     * 정해졌으므로 분석 결과도 같은 규칙으로 <b>양쪽 몫에</b> 나눠 들어가야 한다. 한쪽만
     * 채우면 같은 끼니인데 커플 화면의 숫자가 어긋난다.
     */
    @Test
    void 데이트_식단은_양쪽_몫에_절반씩_채운다() {
        Long me = register("auto5@fitto.com");
        Long partner = register("auto6@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());
        when(foodAnalysisService.analyze(anyLong(), any())).thenReturn(twoFoods());

        mealService.save(me, photoOnly(true));

        await().atMost(ANALYZED).untilAsserted(() -> {
            assertThat(mealService.findToday(me).get(0).calories()).isEqualTo(400);
            assertThat(mealService.findToday(partner).get(0).calories()).isEqualTo(400);
        });
    }

    /**
     * 수정 화면을 열어 저장했다는 건 화면에 뜬 값을 본인이 확인했다는 뜻 —
     * "AI 추정" 배지가 사라져야 한다.
     */
    @Test
    void 사용자가_수정하면_AI_추정_표시가_사라진다() {
        Long user = register("auto7@fitto.com");
        when(foodAnalysisService.analyze(anyLong(), any())).thenReturn(twoFoods());

        MealResponse saved = mealService.save(user, photoOnly(false));
        await().atMost(ANALYZED).untilAsserted(() ->
                assertThat(mealService.findToday(user).get(0).nutritionSource())
                        .isEqualTo(NutritionSource.AI_ESTIMATED));

        mealService.update(user, saved.id(), new SaveMealRequest(LocalDate.now(), MealType.LUNCH, null,
                "https://res.cloudinary.com/demo/image/upload/lunch.jpg",
                null, null, null, null, null, null, null,
                List.of(new MealItemRequest("김치찌개", "1인분", 450, 30, 25, 30))));

        MealResponse after = mealService.findToday(user).get(0);
        assertThat(after.nutritionSource()).isEqualTo(NutritionSource.USER);
        assertThat(after.calories()).isEqualTo(450);
    }
}
