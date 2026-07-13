package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
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

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null)).user().id();
    }

    private SaveMealRequest sample(LocalDate date, MealType type) {
        return new SaveMealRequest(date, type, "닭가슴살 샐러드", null, 420);
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
    void 남의_기록은_삭제할_수_없다() {
        Long owner = register("m3@fitto.com");
        Long other = register("m4@fitto.com");
        MealResponse saved = mealService.save(owner, sample(LocalDate.now(), MealType.SNACK));

        assertThatThrownBy(() -> mealService.delete(other, saved.id()))
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
}
