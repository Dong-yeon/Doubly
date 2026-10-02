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
 * 커플 캘린더의 다녀온 곳 오버레이 — H2 기반.
 *
 * <p>핵심 규칙 세 가지를 지킨다. ① <b>장소가 붙은 기록만</b> 올라간다(집밥까지 올리면
 * 자주 만나는 커플의 달력이 마커로 덮인다). ② 커플 양쪽에 짝으로 저장되거나 둘 다 기록해도
 * <b>같은 날·같은 곳은 한 줄</b>이다. ③ 한 사람만 기록한 방문은 <b>누가 갔는지</b>를 싣는다.
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

    /**
     * "다녀왔어요"의 모양 — 같이 먹기가 아닌 식단 + 방문. 예전엔 "혼자 먹은 기록은 데이트가
     * 아니다"로 뺐는데, 그 탓에 "다녀왔어요"가 통째로 캘린더에서 빠졌다(2026-10-02).
     * 이제 싣고, 누가 다녀갔는지를 visitedBy 로 알려 화면이 배지로 보여준다.
     */
    @Test
    void 다녀왔어요_방문은_누가_갔는지와_함께_올라온다() {
        Long[] c = couple("dmc4a@fitto.com", "dmc4b@fitto.com");
        Long mealId = mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, "혼밥", null, 700, null, null, null,
                null, null, null, null)).id();
        Long placeId = placeService.save(c[0], new SavePlaceRequest(
                "혼밥집", "서울", null, null, "한식")).id();
        placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(LocalDate.now(), 4, null, null, mealId));

        LocalDate today = LocalDate.now();
        // 상대 화면에서도 같은 한 줄이 보인다 — 커플 장소의 방문은 피드에도 이미 둘 다 보인다
        for (Long viewer : c) {
            List<DateMealResponse> rows =
                    dateMealCalendarService.month(viewer, today.getYear(), today.getMonthValue());
            assertThat(rows).hasSize(1);
            DateMealResponse r = rows.get(0);
            assertThat(r.placeName()).isEqualTo("혼밥집");
            assertThat(r.mealId()).isEqualTo(mealId);
            assertThat(r.visitedBy()).isEqualTo(c[0]);
        }
    }

    /** 식단 없이 남긴 방문도 싣는다 — 제목은 방문 메모, 없으면 "다녀왔어요". */
    @Test
    void 식단_없이_남긴_방문도_올라온다() {
        Long[] c = couple("dmc6a@fitto.com", "dmc6b@fitto.com");
        Long gallery = placeService.save(c[1], new SavePlaceRequest(
                "미술관", "서울", null, null, "문화")).id();
        Long cafe = placeService.save(c[1], new SavePlaceRequest(
                "카페", "서울", null, null, "카페")).id();
        placeService.recordVisit(c[1], gallery,
                new RecordVisitRequest(LocalDate.now(), 5, "전시 좋았다", null, null));
        placeService.recordVisit(c[1], cafe,
                new RecordVisitRequest(LocalDate.now(), null, null, null, null));

        LocalDate today = LocalDate.now();
        List<DateMealResponse> rows =
                dateMealCalendarService.month(c[0], today.getYear(), today.getMonthValue());

        assertThat(rows).extracting(DateMealResponse::placeName, DateMealResponse::title)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("미술관", "전시 좋았다"),
                        org.assertj.core.groups.Tuple.tuple("카페", "다녀왔어요"));
        assertThat(rows).allSatisfy(r -> {
            assertThat(r.mealId()).isNull();
            assertThat(r.visitedBy()).isEqualTo(c[1]);
        });
    }

    /** 같은 날 같은 곳을 둘 다 기록했으면 함께 간 것이다 — 한 줄, 누가 갔는지 배지 없음. */
    @Test
    void 같은_날_같은_곳을_둘_다_기록하면_한_줄이고_함께_간_것이다() {
        Long[] c = couple("dmc7a@fitto.com", "dmc7b@fitto.com");
        Long placeId = placeService.save(c[0], new SavePlaceRequest(
                "공원", "서울", null, null, "산책")).id();
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(LocalDate.now(), null, null, null, null));
        placeService.recordVisit(c[1], placeId, new RecordVisitRequest(LocalDate.now(), null, null, null, null));

        LocalDate today = LocalDate.now();
        List<DateMealResponse> rows =
                dateMealCalendarService.month(c[0], today.getYear(), today.getMonthValue());

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).visitedBy()).isNull();
    }

    /** 같이 먹기 식단에 붙은 방문은 식단 쪽 한 줄로만 나온다 — 방문으로 한 번 더 찍히지 않는다. */
    @Test
    void 같이_먹기_식단의_방문은_두_번_찍히지_않는다() {
        Long[] c = couple("dmc8a@fitto.com", "dmc8b@fitto.com");
        dateMealAt(c[0], "트라토리아", "파스타");

        LocalDate today = LocalDate.now();
        List<DateMealResponse> rows =
                dateMealCalendarService.month(c[0], today.getYear(), today.getMonthValue());

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).title()).isEqualTo("파스타");
        assertThat(rows.get(0).visitedBy()).isNull();
        assertThat(rows.get(0).visitId()).isNotNull();
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
