package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.NutritionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.PartnerTodayResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 식단 기록 통합 플로우 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class MealFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    MealService mealService;
    @Autowired
    NutritionService nutritionService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private SaveMealRequest sample(LocalDate date, MealType type) {
        return new SaveMealRequest(date, type, "닭가슴살 샐러드", null, 420, null, null, null, null, null, null, null);
    }

    private SaveMealRequest withProtein(LocalDate date, MealType type, int protein) {
        return new SaveMealRequest(date, type, "단백질 식단", null, null, null, protein, null, null, null, null, null);
    }

    /** 반찬 3개짜리 한 끼 — 합계 820kcal / 탄 100 · 단 45 · 지 25 */
    private SaveMealRequest withItems(LocalDate date, MealType type) {
        return new SaveMealRequest(date, type, null, null, null, null, null, null, null, null, null, List.of(
                new MealItemRequest("삼겹살", "1인분", 500, 0, 30, 40),
                new MealItemRequest("공기밥", "1공기", 300, 90, 6, 1),
                new MealItemRequest("김치", "조금", 20, 4, 1, 0)));
    }

    @Test
    void 식단을_저장하면_오늘_기록에_반영된다() {
        Long user = register("m1@fitto.com");

        MealResponse saved = mealService.save(user, sample(LocalDate.now(), MealType.LUNCH));
        assertThat(saved.id()).isNotNull();
        assertThat(saved.mealTypeLabel()).isEqualTo("점심");
        assertThat(saved.calories()).isEqualTo(420);

        assertThat(mealService.findToday(user)).hasSize(1);
    }

    @Test
    void 히스토리는_최신순으로_조회된다() {
        Long user = register("m2@fitto.com");
        mealService.save(user, sample(LocalDate.now().minusDays(2), MealType.BREAKFAST));
        mealService.save(user, sample(LocalDate.now().minusDays(1), MealType.DINNER));

        List<MealResponse> history = mealService.findHistory(user, null);
        assertThat(history).hasSize(2);
        assertThat(history.get(0).id()).isGreaterThan(history.get(1).id());
    }

    @Test
    void 단백질_목표를_막_채우면_감지된다() {
        Long user = register("pg1@fitto.com");
        nutritionService.setGoal(user, new NutritionGoalRequest(null, null, 100, null));

        // 60g — 아직 목표(100g) 미달
        MealResponse first = mealService.save(user, withProtein(LocalDate.now(), MealType.BREAKFAST, 60));
        assertThat(first.goals()).isEmpty();

        // 60 + 45 = 105g — 이번 기록으로 막 목표를 넘었다
        MealResponse second = mealService.save(user, withProtein(LocalDate.now(), MealType.LUNCH, 45));
        assertThat(second.goals()).hasSize(1);
        assertThat(second.goals().get(0).nutrient()).isEqualTo("protein");
        assertThat(second.goals().get(0).consumed()).isEqualTo(105);
        assertThat(second.goals().get(0).target()).isEqualTo(100);
    }

    @Test
    void 이미_달성한_날_또_기록해도_중복으로_감지되지_않는다() {
        Long user = register("pg2@fitto.com");
        nutritionService.setGoal(user, new NutritionGoalRequest(null, null, 50, null));

        mealService.save(user, withProtein(LocalDate.now(), MealType.BREAKFAST, 60)); // 이미 달성
        MealResponse third = mealService.save(user, withProtein(LocalDate.now(), MealType.DINNER, 20));

        assertThat(third.goals()).isEmpty();
    }

    @Test
    void 목표를_설정하지_않았으면_감지되지_않는다() {
        Long user = register("pg3@fitto.com");
        // setGoal 호출 없음 — 목표 미설정

        MealResponse saved = mealService.save(user, withProtein(LocalDate.now(), MealType.LUNCH, 999));
        assertThat(saved.goals()).isEmpty();
    }

    @Test
    void 남의_기록은_삭제할_수_없다() {
        Long owner = register("m3@fitto.com");
        Long other = register("m4@fitto.com");
        MealResponse saved = mealService.save(owner, sample(LocalDate.now(), MealType.SNACK));

        assertThatThrownBy(() -> mealService.delete(other, saved.id()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 어제_식단을_오늘로_복사하면_끼니와_매크로가_그대로_유지된다() {
        Long user = register("m5@fitto.com");
        mealService.save(user, new SaveMealRequest(
                LocalDate.now().minusDays(1), MealType.BREAKFAST, "닭가슴살 샐러드", null, 420, 30, 40, 10, null, null, null, null));
        mealService.save(user, sample(LocalDate.now().minusDays(1), MealType.LUNCH));

        List<MealResponse> copied = mealService.copyFrom(user, LocalDate.now().minusDays(1));

        assertThat(copied).hasSize(2);
        assertThat(copied).allMatch(m -> m.mealDate().equals(LocalDate.now()));
        assertThat(mealService.findToday(user)).hasSize(2);
        MealResponse breakfast = copied.stream()
                .filter(m -> m.mealType() == MealType.BREAKFAST).findFirst().orElseThrow();
        assertThat(breakfast.calories()).isEqualTo(420);
    }

    @Test
    void 복사할_기록이_없는_날짜는_예외를_던진다() {
        Long user = register("m6@fitto.com");

        assertThatThrownBy(() -> mealService.copyFrom(user, LocalDate.now().minusDays(1)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 커플_상대방의_오늘_식단_여부를_조회한다() {
        Long a = register("mc1@fitto.com");
        Long b = register("mc2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        PartnerTodayResponse before = mealService.partnerToday(a);
        assertThat(before.connected()).isTrue();
        assertThat(before.completed()).isFalse();

        mealService.save(b, sample(LocalDate.now(), MealType.LUNCH));
        PartnerTodayResponse after = mealService.partnerToday(a);
        assertThat(after.completed()).isTrue();
    }

    @Test
    void 항목으로_저장하면_칼로리와_매크로가_항목_합으로_계산된다() {
        Long user = register("mi1@fitto.com");

        MealResponse saved = mealService.save(user, withItems(LocalDate.now(), MealType.DINNER));

        assertThat(saved.items()).extracting(i -> i.name())
                .containsExactly("삼겹살", "공기밥", "김치");
        assertThat(saved.calories()).isEqualTo(820);
        assertThat(saved.carbs()).isEqualTo(94);
        assertThat(saved.protein()).isEqualTo(37);
        assertThat(saved.fat()).isEqualTo(41);
        // 조회 경로에서도 항목이 그대로 실린다
        assertThat(mealService.findToday(user).get(0).items()).hasSize(3);
    }

    @Test
    void 항목을_보내면_요청의_합계값은_무시하고_다시_더한다() {
        Long user = register("mi2@fitto.com");

        MealResponse saved = mealService.save(user, new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, null, null, 9999, 9999, 9999, 9999, null, null, null,
                List.of(new MealItemRequest("계란", "2개", 140, 1, 12, 10))));

        assertThat(saved.calories()).isEqualTo(140);
        assertThat(saved.protein()).isEqualTo(12);
    }

    @Test
    void 반찬_하나를_빼면_끼니_칼로리가_그만큼_줄어든다() {
        Long user = register("mi3@fitto.com");
        MealResponse saved = mealService.save(user, withItems(LocalDate.now(), MealType.DINNER));

        // 공기밥(300kcal)을 빼고 나머지 둘만 남긴다 — 수정은 전량 교체
        MealResponse updated = mealService.update(user, saved.id(), new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, null, null, null, null, null, null, null, null, null, List.of(
                        new MealItemRequest("삼겹살", "1인분", 500, 0, 30, 40),
                        new MealItemRequest("김치", "조금", 20, 4, 1, 0))));

        assertThat(updated.items()).extracting(i -> i.name()).containsExactly("삼겹살", "김치");
        assertThat(updated.calories()).isEqualTo(520);
        assertThat(updated.carbs()).isEqualTo(4);
        // 다시 조회해도 지운 항목이 살아있지 않다 (orphanRemoval)
        assertThat(mealService.findToday(user).get(0).items()).hasSize(2);
    }

    @Test
    void 반찬_하나의_칼로리만_고칠_수_있다() {
        Long user = register("mi4@fitto.com");
        MealResponse saved = mealService.save(user, withItems(LocalDate.now(), MealType.DINNER));

        // 공기밥을 반 공기(150kcal)로 — 나머지 항목은 그대로 다시 보낸다
        MealResponse updated = mealService.update(user, saved.id(), new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, null, null, null, null, null, null, null, null, null, List.of(
                        new MealItemRequest("삼겹살", "1인분", 500, 0, 30, 40),
                        new MealItemRequest("공기밥", "반 공기", 150, 45, 3, 1),
                        new MealItemRequest("김치", "조금", 20, 4, 1, 0))));

        assertThat(updated.calories()).isEqualTo(670);
        assertThat(updated.items().get(1).portion()).isEqualTo("반 공기");
    }

    @Test
    void 항목_없이_합계만_수정하면_보낸_값이_그대로_반영된다() {
        Long user = register("mi5@fitto.com");
        MealResponse saved = mealService.save(user, sample(LocalDate.now(), MealType.LUNCH));

        MealResponse updated = mealService.update(user, saved.id(), new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, "닭가슴살 샐러드(수정)", null, 500, null, null, null, null, null, null, null));

        assertThat(updated.items()).isEmpty();
        assertThat(updated.calories()).isEqualTo(500);
        assertThat(updated.mealType()).isEqualTo(MealType.DINNER);
        assertThat(updated.memo()).isEqualTo("닭가슴살 샐러드(수정)");
    }

    @Test
    void 수정은_목표_달성_축하를_다시_띄우지_않는다() {
        Long user = register("mi6@fitto.com");
        nutritionService.setGoal(user, new NutritionGoalRequest(null, null, 100, null));
        MealResponse saved = mealService.save(user, withProtein(LocalDate.now(), MealType.LUNCH, 120));
        assertThat(saved.goals()).hasSize(1);

        MealResponse updated = mealService.update(user, saved.id(),
                new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "단백질 식단", null, null, null, 130, null, null, null, null, null));

        assertThat(updated.goals()).isEmpty();
    }

    @Test
    void 남의_기록은_수정할_수_없다() {
        Long owner = register("mi7@fitto.com");
        Long other = register("mi8@fitto.com");
        MealResponse saved = mealService.save(owner, sample(LocalDate.now(), MealType.SNACK));

        assertThatThrownBy(() -> mealService.update(other, saved.id(),
                sample(LocalDate.now(), MealType.SNACK)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 미래_날짜로는_수정할_수_없다() {
        Long user = register("mi9@fitto.com");
        MealResponse saved = mealService.save(user, sample(LocalDate.now(), MealType.LUNCH));

        assertThatThrownBy(() -> mealService.update(user, saved.id(),
                sample(LocalDate.now().plusDays(1), MealType.LUNCH)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 어제_식단을_복사하면_항목까지_따라온다() {
        Long user = register("mi10@fitto.com");
        mealService.save(user, withItems(LocalDate.now().minusDays(1), MealType.DINNER));

        List<MealResponse> copied = mealService.copyFrom(user, LocalDate.now().minusDays(1));

        assertThat(copied).hasSize(1);
        assertThat(copied.get(0).items()).extracting(i -> i.name())
                .containsExactly("삼겹살", "공기밥", "김치");
        assertThat(copied.get(0).calories()).isEqualTo(820);
    }

    @Test
    void 기록을_지우면_항목도_함께_사라진다() {
        Long user = register("mi11@fitto.com");
        MealResponse saved = mealService.save(user, withItems(LocalDate.now(), MealType.DINNER));

        mealService.delete(user, saved.id());

        assertThat(mealService.findToday(user)).isEmpty();
    }

    private SaveMealRequest sharedWithItems(LocalDate date, MealType type) {
        return new SaveMealRequest(date, type, null, null, null, null, null, null, null, null, null,
                List.of(
                        new MealItemRequest("삼겹살", "1인분", 500, 0, 30, 40),
                        new MealItemRequest("공기밥", "1공기", 300, 90, 6, 1),
                        new MealItemRequest("김치", "조금", 20, 4, 1, 0)),
                true);
    }

    @Test
    void 데이트_식단으로_저장하면_상대방에게도_절반_칼로리로_등록된다() {
        Long a = register("date1@fitto.com");
        Long b = register("date2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        // 원본 합계는 820kcal / 탄 94 · 단 37 · 지 41 (항목으로 저장하면 요청의 합계값은 무시하고 항목을 다시 더한다)
        MealResponse mine = mealService.save(a, sharedWithItems(LocalDate.now(), MealType.DINNER));

        assertThat(mine.calories()).isEqualTo(410);
        assertThat(mine.carbs()).isEqualTo(47);
        assertThat(mine.protein()).isEqualTo(19);
        assertThat(mine.fat()).isEqualTo(21);
        assertThat(mine.sharedWithPartner()).isTrue();
        assertThat(mine.items()).extracting(i -> i.calories())
                .containsExactly(250, 150, 10);

        List<MealResponse> partnerToday = mealService.findToday(b);
        assertThat(partnerToday).hasSize(1);
        MealResponse partnerMeal = partnerToday.get(0);
        assertThat(partnerMeal.calories()).isEqualTo(410);
        assertThat(partnerMeal.mealType()).isEqualTo(MealType.DINNER);
        assertThat(partnerMeal.sharedWithPartner()).isTrue();
        assertThat(partnerMeal.items()).extracting(i -> i.name())
                .containsExactly("삼겹살", "공기밥", "김치");
    }

    @Test
    void 커플이_아니면_데이트_플래그를_보내도_혼자만_저장된다() {
        Long user = register("date3@fitto.com");

        MealResponse saved = mealService.save(user, sharedWithItems(LocalDate.now(), MealType.LUNCH));

        assertThat(saved.calories()).isEqualTo(820);
        assertThat(saved.sharedWithPartner()).isFalse();
        assertThat(mealService.findToday(user)).hasSize(1);
    }
}
