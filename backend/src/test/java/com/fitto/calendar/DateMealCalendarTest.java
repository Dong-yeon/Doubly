package com.fitto.calendar;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.calendar.dto.DateMealResponse;
import com.fitto.calendar.service.DateMealCalendarService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 커플 캘린더의 데이트 기록 오버레이 — H2 기반.
 *
 * <p>핵심 규칙 두 가지를 지킨다. ① <b>장소가 붙은 데이트 식단만</b> 올라간다(집밥까지 올리면
 * 자주 만나는 커플의 달력이 마커로 덮인다). ② 커플 양쪽에 짝으로 저장돼도 <b>하루 한 줄</b>이다.
 */
@SpringBootTest
@ActiveProfiles("test")
class DateMealCalendarTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MealService mealService;
    @Autowired PlaceService placeService;
    @Autowired DateMealCalendarService dateMealCalendarService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private Long[] couple(String a, String b) {
        Long ua = register(a);
        Long ub = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ua);
        relationService.connectCouple(ub, invite.code());
        return new Long[]{ua, ub};
    }

    /** 장소를 연결한 데이트 식단을 만들고 그 끼니 id 를 돌려준다. */
    private Long dateMealAt(Long userId, String placeName, String food) {
        Long mealId = mealService.save(userId, new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, food, null, 900, null, null, null,
                null, null, null, null, true)).id();
        Long placeId = placeService.save(userId, new SavePlaceRequest(
                placeName, "서울", null, null, "양식")).id();
        placeService.recordVisit(userId, placeId,
                new RecordVisitRequest(LocalDate.now(), 5, null, null, mealId));
        return mealId;
    }

    @Test
    void 장소가_연결된_데이트_식단이_캘린더에_올라온다() {
        Long[] c = couple("dmc1a@fitto.com", "dmc1b@fitto.com");
        dateMealAt(c[0], "트라토리아", "파스타");

        LocalDate today = LocalDate.now();
        List<DateMealResponse> meals =
                dateMealCalendarService.month(c[0], today.getYear(), today.getMonthValue());

        assertThat(meals).hasSize(1);
        DateMealResponse m = meals.get(0);
        assertThat(m.date()).isEqualTo(today);
        assertThat(m.title()).isEqualTo("파스타");
        assertThat(m.placeName()).isEqualTo("트라토리아");
    }

    /**
     * 커플 양쪽에 짝이 저장돼도 하루 한 줄이다 — 상대 화면에서도 마찬가지다.
     * (짝이 둘 다 실리면 같은 한 끼가 달력에 두 번 찍힌다)
     */
    @Test
    void 데이트_식단은_커플_양쪽_화면에서_각각_한_줄로만_보인다() {
        Long[] c = couple("dmc2a@fitto.com", "dmc2b@fitto.com");
        dateMealAt(c[0], "트라토리아", "파스타");

        LocalDate today = LocalDate.now();
        for (Long viewer : c) {
            assertThat(dateMealCalendarService.month(viewer, today.getYear(), today.getMonthValue()))
                    .hasSize(1);
        }
    }

    /**
     * 집에서 같이 먹은 끼니는 빠진다 — 자주 만나는 커플은 "같이 먹기"를 매일 찍으므로
     * 전부 올리면 달력이 마커로 덮여 의미를 잃는다. 장소 연결이 외식과 집밥을 가르는 선이다.
     */
    @Test
    void 장소가_없는_데이트_식단은_캘린더에_올라오지_않는다() {
        Long[] c = couple("dmc3a@fitto.com", "dmc3b@fitto.com");
        mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, "집밥", null, 600, null, null, null,
                null, null, null, null, true));

        LocalDate today = LocalDate.now();
        assertThat(dateMealCalendarService.month(c[0], today.getYear(), today.getMonthValue()))
                .isEmpty();
    }

    /** 혼자 먹은 기록은 장소를 붙여도 "데이트"가 아니다. */
    @Test
    void 혼자_먹은_기록은_장소가_있어도_캘린더에_올라오지_않는다() {
        Long[] c = couple("dmc4a@fitto.com", "dmc4b@fitto.com");
        Long mealId = mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, "혼밥", null, 700, null, null, null,
                null, null, null, null)).id();
        Long placeId = placeService.save(c[0], new SavePlaceRequest(
                "혼밥집", "서울", null, null, "한식")).id();
        placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(LocalDate.now(), 4, null, null, mealId));

        LocalDate today = LocalDate.now();
        assertThat(dateMealCalendarService.month(c[0], today.getYear(), today.getMonthValue()))
                .isEmpty();
    }

    /** 다른 달의 기록은 이 달 캘린더에 섞이지 않는다. */
    @Test
    void 다른_달의_데이트_식단은_섞이지_않는다() {
        Long[] c = couple("dmc5a@fitto.com", "dmc5b@fitto.com");
        dateMealAt(c[0], "트라토리아", "파스타");

        LocalDate nextMonth = LocalDate.now().plusMonths(1);
        assertThat(dateMealCalendarService.month(c[0], nextMonth.getYear(), nextMonth.getMonthValue()))
                .isEmpty();
    }
}
