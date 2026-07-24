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
                "영화 데이트", today.plusDays(3), EventType.DATE, false, null));
        // 작년 시작된 매년 반복 생일
        calendarService.create(c[1], new CreateEventRequest(
                "생일", today.minusYears(1), EventType.BIRTHDAY, true, "미역국"));

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
                "지난 약속", today.minusDays(5), EventType.DATE, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "오늘 약속", today, EventType.DATE, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "다음주 약속", today.plusDays(7), EventType.DATE, false, null));

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
                "우리만의 약속", LocalDate.now().plusDays(1), EventType.DATE, false, null));

        assertThatThrownBy(() -> calendarService.update(
                c2[0], event.id(), new UpdateEventRequest("탈취", null, null, null, null)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> calendarService.delete(c2[0], event.id()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 디데이_푸시_대상은_오늘_일정과_월일이_일치하는_반복_일정이다() {
        Long[] c = couple("cal4a@fitto.com", "cal4b@fitto.com");
        LocalDate today = LocalDate.now();

        calendarService.create(c[0], new CreateEventRequest(
                "오늘 단발", today, EventType.DATE, false, null));
        calendarService.create(c[0], new CreateEventRequest(
                "작년부터 반복", today.minusYears(2), EventType.ANNIVERSARY, true, null));
        calendarService.create(c[0], new CreateEventRequest(
                "내일 일정", today.plusDays(1), EventType.DATE, false, null));
        // 내년 시작 반복 일정 — 아직 울리면 안 된다
        calendarService.create(c[0], new CreateEventRequest(
                "내년부터 반복", today.plusYears(1), EventType.BIRTHDAY, true, null));

        assertThat(ddayNotifier.eventsOccurringOn(today))
                .extracting(e -> e.getTitle())
                .containsExactlyInAnyOrder("오늘 단발", "작년부터 반복");
    }
}
