package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.NutritionSummaryResponse;
import com.fitto.diet.service.NutritionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripRecapResponse;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.service.TripRecapService;
import com.fitto.trip.service.TripService;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.repository.WorkoutRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 여행 모드 통합 플로우 (PLAN.md Travel Mode) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TripTravelModeFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TripService tripService;
    @Autowired
    TripRecapService tripRecapService;
    @Autowired
    NutritionService nutritionService;
    @Autowired
    WorkoutRepository workoutRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    /** 오늘을 포함하는 여행 — 여행 모드 효과를 즉시 관찰할 수 있다. */
    private SaveTripRequest ongoingTrip() {
        return new SaveTripRequest("오사카 여행",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(1), null, null);
    }

    /** 미래 여행 — 오늘이 기간 밖이라 여행 모드를 켜도 효과가 없어야 한다. */
    private SaveTripRequest futureTrip() {
        return new SaveTripRequest("제주도 여행",
                LocalDate.now().plusDays(30), LocalDate.now().plusDays(32), null, null);
    }

    @Test
    void 여행_모드를_켜면_기간_안에서_식단_목표가_숨는다() {
        long[] c = couple("tm1@fitto.com", "tm2@fitto.com");
        nutritionService.setGoal(c[0], new NutritionGoalRequest(2000, 200, 150, 60));
        assertThat(nutritionService.today(c[0]).targetCalories()).isEqualTo(2000);

        TripResponse trip = tripService.save(c[0], ongoingTrip());
        TripResponse updated = tripService.setTravelMode(c[1], trip.id(), true); // 상대도 토글 가능
        assertThat(updated.travelModeEnabled()).isTrue();

        NutritionSummaryResponse nut = nutritionService.today(c[0]);
        assertThat(nut.travelMode()).isTrue();
        assertThat(nut.travelModeTripTitle()).isEqualTo("오사카 여행");
        assertThat(nut.targetCalories()).isNull();
        assertThat(nut.targetCarbs()).isNull();
    }

    @Test
    void 여행_모드를_꺼도_목표값은_그대로_남아있다() {
        long[] c = couple("tm3@fitto.com", "tm4@fitto.com");
        nutritionService.setGoal(c[0], new NutritionGoalRequest(1800, null, null, null));
        TripResponse trip = tripService.save(c[0], ongoingTrip());

        tripService.setTravelMode(c[0], trip.id(), true);
        assertThat(nutritionService.today(c[0]).targetCalories()).isNull();

        tripService.setTravelMode(c[0], trip.id(), false);
        NutritionSummaryResponse nut = nutritionService.today(c[0]);
        assertThat(nut.travelMode()).isFalse();
        assertThat(nut.targetCalories()).isEqualTo(1800); // 저장했던 값이 그대로 복원(사실은 애초에 지워진 적이 없음)
    }

    @Test
    void 여행_기간_밖이면_여행_모드가_켜져도_목표를_숨기지_않는다() {
        long[] c = couple("tm5@fitto.com", "tm6@fitto.com");
        nutritionService.setGoal(c[0], new NutritionGoalRequest(2200, null, null, null));
        TripResponse trip = tripService.save(c[0], futureTrip());

        tripService.setTravelMode(c[0], trip.id(), true);

        NutritionSummaryResponse nut = nutritionService.today(c[0]);
        assertThat(nut.travelMode()).isFalse();
        assertThat(nut.targetCalories()).isEqualTo(2200);
    }

    @Test
    void 다른_커플은_여행_모드를_토글할_수_없다() {
        long[] c1 = couple("tm7@fitto.com", "tm8@fitto.com");
        long[] c2 = couple("tm9@fitto.com", "tm10@fitto.com");
        TripResponse trip = tripService.save(c1[0], ongoingTrip());

        assertThatThrownBy(() -> tripService.setTravelMode(c2[0], trip.id(), true))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void 여행_중_운동_기록은_회고에_두_사람_합산으로_잡힌다() {
        long[] c = couple("tm11@fitto.com", "tm12@fitto.com");
        TripResponse trip = tripService.save(c[0], ongoingTrip());
        tripService.setTravelMode(c[0], trip.id(), true);

        workoutRepository.save(Workout.builder().userId(c[0]).workoutDate(LocalDate.now()).build());
        workoutRepository.save(Workout.builder().userId(c[1]).workoutDate(LocalDate.now()).build());
        // 여행 기간 밖 기록은 세지 않는다
        workoutRepository.save(Workout.builder().userId(c[0]).workoutDate(LocalDate.now().plusDays(10)).build());

        TripRecapResponse recap = tripRecapService.recap(c[0], trip.id());
        assertThat(recap.workoutCount()).isEqualTo(2);
        assertThat(recap.travelModeEnabled()).isTrue();
    }
}
