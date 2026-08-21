package com.fitto.calendar;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.dto.EventResponse;
import com.fitto.calendar.dto.UpdateEventRequest;
import com.fitto.calendar.service.CalendarDdayNotifier;
import com.fitto.calendar.service.CalendarService;
import com.fitto.common.exception.BusinessException;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 캘린더 통합 플로우 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class CalendarFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CalendarService calendarService;
    @Autowired CalendarDdayNotifier ddayNotifier;

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

    @Test
    void 일정을_만들고_해당_월에서_조회한다_반복_일정은_해마다_나타난다() {
        Long[] c = couple("cal1a@fitto.com", "cal1b@fitto.com");
        LocalDate today = LocalDate.now();

        calendarService.create(c[0], new CreateEventRequest(
                "영화 데이트", today.plusDays(3), null, EventType.DATE, false, null));
        // 작년 시작된 매년 반복 생일
        calendarService.create(c[1], new CreateEventRequest(
                "생일", today.minusYears(1), null, EventType.BIRTHDAY, true, "미역국"));

        List<EventResponse> thisMonth = calendarService.monthEvents(
                c[0], today.getYear(), today.getMonthValue());

        // 반복 일정은 올해 발생일로 계산된다 (단, 이번 달 3일 뒤가 달을 넘길 수 있어 별도 검증)
        assertThat(thisMonth).extracting(EventResponse::title).contains("생일");
        EventResponse birthday = thisMonth.stream()
                .filter(e -> e.title().equals("생일")).findFirst().orElseThrow();
        assertThat(birthday.date().getYear()).isEqualTo(today.getYear());

        // 내년 같은 달에도 나타난다
        List<EventResponse> nextYear = calendarService.monthEvents(
                c[0], today.getYear() + 1, today.getMonthValue());
        assertThat(nextYear).extracting(EventResponse::title).contains("생일");
        // 반복 시작 연도 이전에는 나타나지 않는다
        List<EventResponse> twoYearsAgo = calendarService.monthEvents(
                c[0], today.getYear() - 2, today.getMonthValue());
        assertThat(twoYearsAgo).extracting(EventResponse::title).doesNotContain("생일");
    }

    @Test
    void 다가오는_일정은_디데이_오름차순이고_지난_일정은_빠진다() {
        Long[] c = couple("cal2a@fitto.com", "cal2b@fitto.com");
        LocalDate today = LocalDate.now();

        calendarService.create(c[0], new CreateEventRequest(
                "지난 약속", today.minusDays(5), null, EventType.DATE, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "오늘 약속", today, null, EventType.DATE, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "다음주 약속", today.plusDays(7), null, EventType.DATE, false, null));

        List<EventResponse> upcoming = calendarService.upcoming(c[1], 5);

        assertThat(upcoming).extracting(EventResponse::title)
                .containsExactly("오늘 약속", "다음주 약속");
        assertThat(upcoming.get(0).dday()).isZero();
        assertThat(upcoming.get(1).dday()).isEqualTo(7);
    }

    @Test
    void 다른_커플의_일정은_수정도_삭제도_할_수_없다() {
        Long[] c1 = couple("cal3a@fitto.com", "cal3b@fitto.com");
        Long[] c2 = couple("cal3c@fitto.com", "cal3d@fitto.com");

        EventResponse event = calendarService.create(c1[0], new CreateEventRequest(
                "우리만의 약속", LocalDate.now().plusDays(1), null, EventType.DATE, false, null));

        assertThatThrownBy(() -> calendarService.update(
                c2[0], event.id(), new UpdateEventRequest("탈취", null, null, null, null, null)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> calendarService.delete(c2[0], event.id()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 디데이_푸시_대상은_오늘_일정과_월일이_일치하는_반복_일정이다() {
        Long[] c = couple("cal4a@fitto.com", "cal4b@fitto.com");
        LocalDate today = LocalDate.now();

        calendarService.create(c[0], new CreateEventRequest(
                "오늘 단발", today, null, EventType.DATE, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "작년부터 반복", today.minusYears(2), null, EventType.ANNIVERSARY, true, null));
        calendarService.create(c[0], new CreateEventRequest(
                "내일 일정", today.plusDays(1), null, EventType.DATE, false, null));
        // 내년 시작 반복 일정 — 아직 울리면 안 된다
        calendarService.create(c[0], new CreateEventRequest(
                "내년부터 반복", today.plusYears(1), null, EventType.BIRTHDAY, true, null));

        assertThat(ddayNotifier.eventsOccurringOn(today))
                .extracting(e -> e.getTitle())
                .containsExactlyInAnyOrder("오늘 단발", "작년부터 반복");
    }

    @Test
    void 기간_일정은_걸치는_달_모두에서_조회되고_시작_전_달에는_없다() {
        Long[] c = couple("cal5a@fitto.com", "cal5b@fitto.com");
        // 이번 달 말일 ~ 다음 달로 이어지는 기간 일정 — 오늘이 언제든 두 달에 걸친다
        YearMonth thisMonth = YearMonth.now();
        LocalDate start = thisMonth.atEndOfMonth();
        LocalDate end = start.plusDays(3);

        calendarService.create(c[0], new CreateEventRequest(
                "긴 연휴", start, end, EventType.ETC, false, null));

        assertThat(calendarService.monthEvents(c[0], thisMonth.getYear(), thisMonth.getMonthValue()))
                .extracting(EventResponse::title).contains("긴 연휴");
        YearMonth next = thisMonth.plusMonths(1);
        assertThat(calendarService.monthEvents(c[0], next.getYear(), next.getMonthValue()))
                .extracting(EventResponse::title).contains("긴 연휴");
        YearMonth prev = thisMonth.minusMonths(1);
        assertThat(calendarService.monthEvents(c[0], prev.getYear(), prev.getMonthValue()))
                .extracting(EventResponse::title).doesNotContain("긴 연휴");

        // 응답에 종료일이 실려 내려온다 — 프론트가 기간 표기·진행 중 배지에 쓴다
        EventResponse saved = calendarService.monthEvents(
                        c[0], thisMonth.getYear(), thisMonth.getMonthValue()).stream()
                .filter(e -> e.title().equals("긴 연휴")).findFirst().orElseThrow();
        assertThat(saved.endDate()).isEqualTo(end);
    }

    @Test
    void 종료일이_시작일보다_빠르거나_반복과_함께면_거부된다() {
        Long[] c = couple("cal6a@fitto.com", "cal6b@fitto.com");
        LocalDate today = LocalDate.now();

        assertThatThrownBy(() -> calendarService.create(c[0], new CreateEventRequest(
                "뒤집힌 기간", today, today.minusDays(1), EventType.ETC, false, null)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> calendarService.create(c[0], new CreateEventRequest(
                "반복 기간", today, today.plusDays(2), EventType.ANNIVERSARY, true, null)))
                .isInstanceOf(BusinessException.class);

        // 수정으로 우회해도 막힌다 — 하루 일정을 만들어 반복+기간으로 바꿔본다
        EventResponse single = calendarService.create(c[0], new CreateEventRequest(
                "하루 일정", today.plusDays(1), null, EventType.DATE, false, null));
        assertThatThrownBy(() -> calendarService.update(c[0], single.id(),
                new UpdateEventRequest(null, today.plusDays(1), today.plusDays(3), null, true, null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 기간_일정_디데이_푸시는_시작일에만_울린다() {
        Long[] c = couple("cal7a@fitto.com", "cal7b@fitto.com");
        LocalDate today = LocalDate.now();

        calendarService.create(c[0], new CreateEventRequest(
                "오늘 시작 기간", today, today.plusDays(2), EventType.ETC, false, null));

        assertThat(ddayNotifier.eventsOccurringOn(today))
                .extracting(e -> e.getTitle()).contains("오늘 시작 기간");
        // 기간 안이지만 시작일이 아니면 울리지 않는다
        assertThat(ddayNotifier.eventsOccurringOn(today.plusDays(1)))
                .extracting(e -> e.getTitle()).doesNotContain("오늘 시작 기간");
    }

    @Test
    void 진행_중인_기간_일정은_다가오는_일정에_맨_앞으로_나온다() {
        Long[] c = couple("cal8a@fitto.com", "cal8b@fitto.com");
        LocalDate today = LocalDate.now();

        calendarService.create(c[0], new CreateEventRequest(
                "진행 중 기간", today.minusDays(1), today.plusDays(1), EventType.ETC, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "이미 끝난 기간", today.minusDays(5), today.minusDays(3), EventType.ETC, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "내일 약속", today.plusDays(1), null, EventType.DATE, false, null));

        List<EventResponse> upcoming = calendarService.upcoming(c[1], 5);
        assertThat(upcoming).extracting(EventResponse::title)
                .containsExactly("진행 중 기간", "내일 약속");
    }
}
