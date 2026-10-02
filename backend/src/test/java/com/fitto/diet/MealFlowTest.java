package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.DietGoalType;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.NutritionService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.diet.dto.PhotoRecordLookupResponse;
import com.fitto.diet.dto.CoupleMealGoalResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.service.FeedService;
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
    @Autowired
    FeedService feedService;
    @Autowired
    ChatService chatService;
    @Autowired
    CloudinaryImageDeleter imageDeleter;

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

    /** 오늘 식사는 럽바디 "오늘" 섹션 몫 — 히스토리 맨 위에 또 나오던 중복(LOVEBODY_REVIEW §3 A-2) */
    @Test
    void 오늘_식사는_히스토리에_나오지_않는다() {
        Long user = register("hist-today@fitto.com");
        mealService.save(user, sample(LocalDate.now(), MealType.LUNCH));
        MealResponse yesterday = mealService.save(user, sample(LocalDate.now().minusDays(1), MealType.DINNER));

        assertThat(mealService.findHistory(user, null)).extracting(MealResponse::id).containsExactly(yesterday.id());
    }

    /** 지난 날짜로 나중에 적은 기록 — id 순이면 맨 위로 튀어 올랐다. 먹은 날짜 순, 같은 날은 나중에 적은 것 먼저 */
    @Test
    void 지난_날짜로_나중에_적은_기록도_먹은_날짜_순서대로_나온다() {
        Long user = register("hist-order@fitto.com");
        LocalDate today = LocalDate.now();
        mealService.save(user, sample(today.minusDays(1), MealType.LUNCH));
        mealService.save(user, sample(today.minusDays(5), MealType.DINNER)); // 나중에 적은 5일 전
        mealService.save(user, sample(today.minusDays(3), MealType.BREAKFAST));
        MealResponse laterSameDay = mealService.save(user, sample(today.minusDays(1), MealType.DINNER));

        List<MealResponse> history = mealService.findHistory(user, null);
        assertThat(history).extracting(MealResponse::mealDate).containsExactly(
                today.minusDays(1), today.minusDays(1), today.minusDays(3), today.minusDays(5));
        assertThat(history.get(0).id()).isEqualTo(laterSameDay.id());
    }

    /**
     * 페이지 경계 — 커서는 여전히 id 하나(구버전 앱과 같은 요청)인데, 정렬이 날짜 우선이라 서버가 그 행의
     * (meal_date, id) 로 경계를 잡는다. 같은 날짜가 경계를 걸치고, 입력 순서가 날짜와 뒤섞여도 겹치거나 빠지지 않는다.
     */
    @Test
    void 히스토리_페이지_경계에서_중복도_누락도_없다() {
        Long user = register("hist-page@fitto.com");
        LocalDate today = LocalDate.now();
        int[] daysAgo = {3, 1, 7, 2, 2, 5, 1, 9, 4, 4, 4, 6, 8, 2, 3, 10, 1, 5, 7, 4, 6, 3, 2, 8, 9};
        for (int d : daysAgo) {
            mealService.save(user, sample(today.minusDays(d), MealType.SNACK));
        }
        mealService.save(user, sample(today, MealType.LUNCH)); // 오늘 — 어느 페이지에도 없어야 한다

        List<MealResponse> first = mealService.findHistory(user, null);
        assertThat(first).hasSize(20);
        List<MealResponse> second = mealService.findHistory(user, first.get(first.size() - 1).id());
        List<MealResponse> all = new java.util.ArrayList<>(first);
        all.addAll(second);

        assertThat(all).hasSize(daysAgo.length);
        assertThat(all).extracting(MealResponse::id).doesNotHaveDuplicates();
        // 이어 붙인 결과가 그대로 (날짜 desc, id desc) 정렬이어야 한다
        for (int i = 1; i < all.size(); i++) {
            MealResponse prev = all.get(i - 1);
            MealResponse cur = all.get(i);
            boolean ordered = prev.mealDate().isAfter(cur.mealDate())
                    || (prev.mealDate().isEqual(cur.mealDate()) && prev.id() > cur.id());
            assertThat(ordered).as("%d번째 경계 %s/%d → %s/%d", i, prev.mealDate(), prev.id(), cur.mealDate(), cur.id()).isTrue();
        }
        assertThat(mealService.findHistory(user, all.get(all.size() - 1).id())).isEmpty();
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

    /**
     * 목표 방향(감량·유지·증량) — 마법사가 계산에만 쓰고 버리던 값을 저장한다(V115, LOVEBODY_REVIEW §2-1-1).
     * 방향을 싣지 않는 구버전 앱의 목표 저장이 방향을 지우면 안 되고, 비우기는 전용 경로로만 한다.
     */
    @Test
    void 목표_방향은_저장되고_방향_없는_목표_저장은_그것을_지우지_않는다() {
        Long user = register("dir1@fitto.com");
        assertThat(nutritionService.today(user).goalDirection()).isNull();

        nutritionService.setGoal(user, new NutritionGoalRequest(1600, null, 100, null, DietGoalType.LOSE));
        assertThat(nutritionService.today(user).goalDirection()).isEqualTo(DietGoalType.LOSE);

        // 구버전 앱 — 방향 없이 목표만 바꾼다
        nutritionService.setGoal(user, new NutritionGoalRequest(1700, null, 100, null));
        assertThat(nutritionService.today(user).goalDirection()).isEqualTo(DietGoalType.LOSE);
        assertThat(nutritionService.today(user).targetCalories()).isEqualTo(1700);

        // 신체 정보 시트 — 방향만 바꾸고, 비우면 미설정. 칼로리 목표는 그대로
        nutritionService.setGoalDirection(user, DietGoalType.GAIN);
        assertThat(nutritionService.today(user).goalDirection()).isEqualTo(DietGoalType.GAIN);
        nutritionService.setGoalDirection(user, null);
        assertThat(nutritionService.today(user).goalDirection()).isNull();
        assertThat(nutritionService.today(user).targetCalories()).isEqualTo(1700);
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

    /** 회귀 방지: update() 가 sharedGroupId 짝을 건드리지 않으면 두 기록이 어긋난다. */
    @Test
    void 데이트_식단을_수정하면_상대방_기록도_같이_바뀐다() {
        Long a = register("datesync1@fitto.com");
        Long b = register("datesync2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        MealResponse mine = mealService.save(a, sharedWithItems(LocalDate.now(), MealType.DINNER));
        assertThat(mealService.findToday(b)).hasSize(1);

        SaveMealRequest updateReq = new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, "수정된 메모", null,
                null, null, null, null, 12, 300, 4,
                List.of(new MealItemRequest("샐러드", "1인분", 200, 20, 10, 5)));
        mealService.update(a, mine.id(), updateReq);

        MealResponse partnerMeal = mealService.findToday(b).get(0);
        assertThat(partnerMeal.memo()).isEqualTo("수정된 메모");
        assertThat(partnerMeal.calories()).isEqualTo(200);
        assertThat(partnerMeal.sugar()).isEqualTo(12);
        assertThat(partnerMeal.sodium()).isEqualTo(300);
        assertThat(partnerMeal.fiber()).isEqualTo(4);
        assertThat(partnerMeal.items()).extracting(i -> i.name()).containsExactly("샐러드");
    }

    /** 회귀 방지: delete() 가 짝을 남기면 상대방 화면에 존재하지 않는 기록이 남는다. */
    @Test
    void 데이트_식단을_삭제하면_상대방_기록도_같이_지워진다() {
        Long a = register("datedel1@fitto.com");
        Long b = register("datedel2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        MealResponse mine = mealService.save(a, sharedWithItems(LocalDate.now(), MealType.DINNER));
        assertThat(mealService.findToday(b)).hasSize(1);

        mealService.delete(a, mine.id());

        assertThat(mealService.findToday(a)).isEmpty();
        assertThat(mealService.findToday(b)).isEmpty();
    }

    /** 회귀 방지: MealResponse 가 당·나트륨·식이섬유를 안 내려주면 수정 시 그 값이 사라진다. */
    @Test
    void 수정_응답에_당류_나트륨_식이섬유가_들어있다() {
        Long user = register("extras1@fitto.com");
        MealResponse saved = mealService.save(user, new SaveMealRequest(
                LocalDate.now(), MealType.BREAKFAST, null, null,
                300, 20, 10, 5, 8, 150, 3, null));

        MealResponse updated = mealService.update(user, saved.id(), new SaveMealRequest(
                LocalDate.now(), MealType.BREAKFAST, "메모만 수정", null,
                300, 20, 10, 5, 8, 150, 3, null));

        assertThat(updated.sugar()).isEqualTo(8);
        assertThat(updated.sodium()).isEqualTo(150);
        assertThat(updated.fiber()).isEqualTo(3);
    }

    // ---- 럽바디 3단계(LOVEBODY_REVIEW §2-3·§2-4) ----

    /** 주간 스트립 — 개수만 내던 coupleGoal 이 이번 주 날짜 목록도 싣는다. 미연결이면 내 날짜만 */
    @Test
    void 커플_식단_목표에_이번_주_기록_날짜가_실리고_미연결이면_상대는_비어_있다() {
        Long solo = register("week-solo@fitto.com");
        mealService.save(solo, sample(LocalDate.now(), MealType.LUNCH));
        mealService.save(solo, sample(LocalDate.now(), MealType.DINNER)); // 같은 날 두 끼 — 날짜는 하나
        CoupleMealGoalResponse alone = mealService.coupleGoal(solo);
        assertThat(alone.connected()).isFalse();
        assertThat(alone.myDates()).containsExactly(LocalDate.now());
        assertThat(alone.partnerDates()).isEmpty();

        Long a = register("week-a@fitto.com");
        Long b = register("week-b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        mealService.save(b, sample(LocalDate.now(), MealType.BREAKFAST));
        CoupleMealGoalResponse goal = mealService.coupleGoal(a);
        assertThat(goal.connected()).isTrue();
        assertThat(goal.myDates()).isEmpty();
        assertThat(goal.partnerDates()).containsExactly(LocalDate.now());
        assertThat(goal.partnerDays()).isEqualTo(1);
    }

    /** 내 식사 카드에 상대가 피드에서 남긴 반응이 실린다 — 우리 탭 피드와 같은 데이터 */
    @Test
    void 식사_목록에_피드_반응이_실린다() {
        Long a = register("react-a@fitto.com");
        Long b = register("react-b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        MealResponse meal = mealService.save(a, sample(LocalDate.now(), MealType.LUNCH));

        feedService.toggleReaction(b, FeedItemType.MEAL, meal.id(), "❤️");

        List<ReactionSummary> reactions = mealService.findToday(a).get(0).reactions();
        assertThat(reactions).containsExactly(new ReactionSummary("❤️", 1, false));
    }

    /**
     * 데이트 식단 함정(§2-4) — 상대가 등록한 데이트 식단은 피드에 <b>원본</b>만 나오고 반응도 원본에 달린다.
     * 내 몫(복사본) 카드가 자기 id 로만 반응을 찾으면 "피드엔 하트가 있는데 럽바디 카드엔 없다"가 된다.
     */
    @Test
    void 상대가_등록한_데이트_식단의_내_몫은_원본에_달린_반응을_보여준다() {
        Long registrant = register("react-date-a@fitto.com");
        Long me = register("react-date-b@fitto.com");
        relationService.connectCouple(me, relationService.createCoupleInvite(registrant).code());
        MealResponse original = mealService.save(registrant, sharedWithItems(LocalDate.now(), MealType.DINNER));
        MealResponse myCopy = mealService.findToday(me).get(0);
        assertThat(myCopy.id()).isNotEqualTo(original.id());

        // 피드에서 나는 상대(등록자)의 원본 카드에 반응한다 — 복사본은 피드에 없다
        feedService.toggleReaction(me, FeedItemType.MEAL, original.id(), "😋");

        assertThat(mealService.findToday(me).get(0).reactions())
                .containsExactly(new ReactionSummary("😋", 1, true));
        assertThat(mealService.findToday(registrant).get(0).reactions())
                .containsExactly(new ReactionSummary("😋", 1, false));
    }

    // ---- 4단계: 채팅 사진 → 식단 기록(LOVEBODY_REVIEW §2-5) ----

    private SaveMealRequest withPhoto(String photoUrl) {
        // 칼로리를 채워 둔다 — 자동 분석 대상이 되면 백그라운드 작업이 이 테스트와 무관하게 돈다
        return new SaveMealRequest(LocalDate.now(), MealType.LUNCH, null, photoUrl, 500, null, null, null, null, null, null, null);
    }

    private Long couple(String a, String b, Long[] out) {
        out[0] = register(a);
        out[1] = register(b);
        return relationService.connectCouple(out[1], relationService.createCoupleInvite(out[0]).code()).id();
    }

    /** 채팅 사진을 식단으로 옮기면 같은 URL 을 둘이 쓴다 — 식사를 지워도 채팅 이미지 파일은 남아야 한다(A-3 경로) */
    @Test
    void 채팅_사진으로_만든_식사를_지워도_채팅_이미지가_남는다() {
        Long[] u = new Long[2];
        Long relationId = couple("c2m-a@fitto.com", "c2m-b@fitto.com", u);
        String photo = "https://res.cloudinary.com/demo/image/upload/v1/fitto/chat-lunch.jpg";
        chatService.send(u[0], relationId, new SendMessageRequest(MessageType.IMAGE, null, photo, null, null, null));
        MealResponse meal = mealService.save(u[0], withPhoto(photo));

        mealService.delete(u[0], meal.id());

        assertThat(imageDeleter.deletable(List.of(photo))).as("채팅이 아직 쓰는 파일").isEmpty();
    }

    /** 반대로 채팅 메시지를 지워도 식사 사진은 남는다 — 채팅 삭제는 소프트 삭제라 파일을 지우지 않고, 식사가 계속 참조한다 */
    @Test
    void 채팅_메시지를_지워도_식사_사진은_남는다() {
        Long[] u = new Long[2];
        Long relationId = couple("c2m-c@fitto.com", "c2m-d@fitto.com", u);
        String photo = "https://res.cloudinary.com/demo/image/upload/v1/fitto/chat-dinner.jpg";
        ChatMessageResponse sent = chatService.send(u[0], relationId,
                new SendMessageRequest(MessageType.IMAGE, null, photo, null, null, null));
        mealService.save(u[0], withPhoto(photo));

        chatService.delete(u[0], sent.id());

        assertThat(mealService.findToday(u[0]).get(0).photoUrl()).isEqualTo(photo);
        assertThat(imageDeleter.deletable(List.of(photo))).as("식사가 아직 쓰는 파일").isEmpty();
    }

    /** 같은 사진으로 두 번 남기지 않는다 — 메뉴가 먼저 묻고(findByPhoto), 저장도 막는다. 남의 기록과는 무관 */
    @Test
    void 같은_사진으로_두_번_식단을_남기면_막힌다() {
        Long[] u = new Long[2];
        couple("c2m-e@fitto.com", "c2m-f@fitto.com", u);
        String photo = "https://res.cloudinary.com/demo/image/upload/v1/fitto/twice.jpg";
        assertThat(mealService.findByPhoto(u[0], photo).recorded()).isFalse();

        MealResponse first = mealService.save(u[0], withPhoto(photo));

        PhotoRecordLookupResponse found = mealService.findByPhoto(u[0], photo);
        assertThat(found.recorded()).isTrue();
        assertThat(found.mealId()).isEqualTo(first.id());
        assertThat(found.mealTypeLabel()).isEqualTo("점심");
        assertThatThrownBy(() -> mealService.save(u[0], withPhoto(photo)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.MEAL_PHOTO_ALREADY_RECORDED);
        // 상대는 자기 기록이 없으니 같은 URL 이어도 걸리지 않는다
        assertThat(mealService.findByPhoto(u[1], photo).recorded()).isFalse();
    }
}
