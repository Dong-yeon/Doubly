package com.fitto.calendar;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.domain.EventVisibility;
import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.dto.EventResponse;
import com.fitto.calendar.dto.UpdateEventRequest;
import com.fitto.calendar.service.CalendarDdayNotifier;
import com.fitto.calendar.service.CalendarService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 각자의 일정 — 한 달력에 "우리 일정"과 "내 일정"이 함께 놓인다(V101).
 *
 * <p>여기서 지키는 것은 세 가지다.
 * <ul>
 *   <li><b>보이는 범위</b>: PERSONAL 은 상대도 본다(달력을 같이 보는 이유), PRIVATE 은 안 보인다.</li>
 *   <li><b>고칠 권한</b>: 각자의 일정은 주인만. 공개 범위는 만든 사람만 바꾼다.</li>
 *   <li><b>알림</b>: 보이는 것과 알림은 다른 문제다 — 각자의 일정은 주인에게만 간다.</li>
 * </ul>
 *
 * <p>알림 검증의 기준일을 <b>먼 미래</b>로 잡는 이유는 {@code CalendarAdvanceNoticeTest}
 * 와 같다 — 테스트 DB(H2)가 클래스 사이에 공유되고 {@code eventsOccurringOn} 은 커플을
 * 가리지 않고 전체를 훑는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PersonalEventTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CalendarService calendarService;
    @Autowired CalendarDdayNotifier ddayNotifier;

    @MockitoBean NotificationService notificationService;

    /** 다른 테스트 클래스의 알림 단언과 겹치지 않는 기준일. */
    private static final LocalDate BASE = LocalDate.of(2041, 3, 11);

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

    private List<EventResponse> month(Long userId, LocalDate date) {
        return calendarService.monthEvents(userId, date.getYear(), date.getMonthValue());
    }

    /** 내 일정의 값어치는 상대가 "그날 내가 바쁘다"를 아는 데 있다 — 그래서 보인다. */
    @Test
    void 내_일정은_상대에게도_보인다() {
        Long[] c = couple("pv-personal-a@fitto.com", "pv-personal-b@fitto.com");
        LocalDate day = LocalDate.now().plusDays(2);

        calendarService.create(c[0], new CreateEventRequest(
                "팀 회식", day, null, EventType.ETC, false, EventVisibility.PERSONAL, null));

        EventResponse seenByPartner = month(c[1], day).stream()
                .filter(e -> e.title().equals("팀 회식")).findFirst().orElseThrow();
        assertThat(seenByPartner.visibility()).isEqualTo(EventVisibility.PERSONAL);
        // 누구의 일정인지는 createdBy 로 읽는다 — 화면이 "상대 일정" 배지를 붙이는 근거
        assertThat(seenByPartner.createdBy()).isEqualTo(c[0]);
    }

    @Test
    void 나만_보기는_상대에게_보이지_않는다() {
        Long[] c = couple("pv-private-a@fitto.com", "pv-private-b@fitto.com");
        LocalDate day = LocalDate.now().plusDays(3);

        calendarService.create(c[0], new CreateEventRequest(
                "선물 사러", day, null, EventType.ETC, false, EventVisibility.PRIVATE, null));

        assertThat(month(c[0], day)).extracting(EventResponse::title).contains("선물 사러");
        assertThat(month(c[1], day)).extracting(EventResponse::title).doesNotContain("선물 사러");
        // 다가오는 일정도 같은 규칙을 지나야 한다 — 홈 화면이 이 경로로 읽는다
        assertThat(calendarService.upcoming(c[1], 20))
                .extracting(EventResponse::title).doesNotContain("선물 사러");
        assertThat(calendarService.upcoming(c[0], 20))
                .extracting(EventResponse::title).contains("선물 사러");
    }

    /** 숨긴 일정은 404 다 — 403 으로 답하면 "뭔가 있다"가 그것만으로 새어 나간다. */
    @Test
    void 상대의_나만_보기_일정은_존재조차_알_수_없다() {
        Long[] c = couple("pv-hidden-a@fitto.com", "pv-hidden-b@fitto.com");
        LocalDate day = LocalDate.now().plusDays(4);

        Long hiddenId = calendarService.create(c[0], new CreateEventRequest(
                "비밀", day, null, EventType.ETC, false, EventVisibility.PRIVATE, null)).id();

        assertThatThrownBy(() -> calendarService.update(c[1], hiddenId,
                new UpdateEventRequest("들춰보기", null, null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.NOT_FOUND);
        assertThatThrownBy(() -> calendarService.delete(c[1], hiddenId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void 상대의_내_일정은_보이지만_고칠_수는_없다() {
        Long[] c = couple("pv-edit-a@fitto.com", "pv-edit-b@fitto.com");
        LocalDate day = LocalDate.now().plusDays(5);

        Long mine = calendarService.create(c[0], new CreateEventRequest(
                "야근", day, null, EventType.ETC, false, EventVisibility.PERSONAL, null)).id();

        assertThatThrownBy(() -> calendarService.update(c[1], mine,
                new UpdateEventRequest("정시 퇴근", null, null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
        // 주인은 고칠 수 있다
        assertThat(calendarService.update(c[0], mine,
                new UpdateEventRequest("야근 (연장)", null, null, null, null, null)).title())
                .isEqualTo("야근 (연장)");
    }

    /** 우리 일정은 둘 다 고치지만, 내 달력에서 사라지게 만드는 것은 다른 얘기다. */
    @Test
    void 공개_범위는_만든_사람만_바꾼다() {
        Long[] c = couple("pv-scope-a@fitto.com", "pv-scope-b@fitto.com");
        LocalDate day = LocalDate.now().plusDays(6);

        Long shared = calendarService.create(c[0], new CreateEventRequest(
                "우리 저녁", day, null, EventType.DATE, false, null)).id();

        // 상대도 내용은 고칠 수 있다(기존 동작)
        assertThat(calendarService.update(c[1], shared,
                new UpdateEventRequest("우리 저녁 (7시)", null, null, null, null, null)).title())
                .isEqualTo("우리 저녁 (7시)");
        // 하지만 공개 범위는 못 바꾼다
        assertThatThrownBy(() -> calendarService.update(c[1], shared, new UpdateEventRequest(
                null, null, null, null, null, EventVisibility.PRIVATE, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
        // 만든 사람은 바꿀 수 있고, 그 순간 상대 달력에서 사라진다
        calendarService.update(c[0], shared, new UpdateEventRequest(
                null, null, null, null, null, EventVisibility.PRIVATE, null));
        assertThat(month(c[1], day)).extracting(EventResponse::title).doesNotContain("우리 저녁 (7시)");
    }

    /** 공개 범위가 없던 시절의 요청(과 지금까지 쌓인 행)은 전부 우리 일정이다. */
    @Test
    void 공개_범위를_안_주면_우리_일정이다() {
        Long[] c = couple("pv-default-a@fitto.com", "pv-default-b@fitto.com");
        LocalDate day = LocalDate.now().plusDays(7);

        EventResponse created = calendarService.create(c[0], new CreateEventRequest(
                "기본값", day, null, EventType.ETC, false, null));

        assertThat(created.visibility()).isEqualTo(EventVisibility.SHARED);
        assertThat(month(c[1], day)).extracting(EventResponse::title).contains("기본값");
    }

    /** 내 회식을 잡을 때마다 상대 폰이 울리면 개인 일정을 적기가 부담스러워진다. */
    @Test
    void 개인_일정_등록은_상대에게_알리지_않는다() {
        Long[] c = couple("pv-noti-a@fitto.com", "pv-noti-b@fitto.com");
        clearInvocations(notificationService);

        calendarService.create(c[0], new CreateEventRequest(
                "치과", LocalDate.now().plusDays(8), null, EventType.ETC, false,
                EventVisibility.PERSONAL, null));

        verify(notificationService, never()).notify(eq(c[1]), any(), anyString(), anyString(), anyString());

        // 우리 일정은 지금까지처럼 알린다
        calendarService.create(c[0], new CreateEventRequest(
                "우리 약속", LocalDate.now().plusDays(8), null, EventType.DATE, false, null));
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.ANNIVERSARY),
                anyString(), contains("우리 약속"), anyString());
    }

    /** 달력에 보이는 것과 아침에 알림을 받는 것은 다른 문제다. */
    @Test
    void 개인_일정의_당일_알림은_주인에게만_간다() {
        Long[] c = couple("pv-dday-a@fitto.com", "pv-dday-b@fitto.com");
        calendarService.create(c[0], new CreateEventRequest(
                "건강검진", BASE, null, EventType.ETC, false, EventVisibility.PERSONAL, null));
        clearInvocations(notificationService);

        ddayNotifier.notifyFor(BASE);

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.ANNIVERSARY),
                eq("내 일정"), contains("건강검진"), anyString());
        verify(notificationService, never()).notify(eq(c[1]), any(), anyString(), contains("건강검진"), anyString());
    }
}
