package com.fitto.calendar;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.service.CalendarDdayNotifier;
import com.fitto.calendar.service.CalendarService;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 기념일 D-7·D-1 사전 푸시 — 2026-08 진단 리포트 "기념일 D-7·D-1 사전 푸시".
 *
 * <p>"잊지 않게"를 넘어 "준비할 시간"을 주는 것이 목적이라, D-7 은 준비가 필요한
 * 종류(기념일·생일)로 좁힌다.
 *
 * <p>기준일을 <b>먼 미래</b>로 잡는 이유: 테스트 DB(H2 인메모리)가 클래스 사이에 공유되고
 * {@code eventsOccurringOn} 은 커플을 가리지 않고 전체를 훑는다. 여기서 "오늘" 일정을
 * 만들면 {@code CalendarFlowTest} 의 오늘자 단언이 이 클래스 때문에 깨진다.
 */
@SpringBootTest
@ActiveProfiles("test")
class CalendarAdvanceNoticeTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CalendarService calendarService;
    @Autowired CalendarDdayNotifier ddayNotifier;

    @MockitoBean NotificationService notificationService;

    /** 다른 테스트 클래스의 "오늘" 단언과 겹치지 않는 기준일. */
    private static final LocalDate BASE = LocalDate.of(2040, 5, 20);

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
    void 기념일은_일주일_전에_양쪽에_미리_알린다() {
        Long[] c = couple("adv-7a@fitto.com", "adv-7b@fitto.com");
        LocalDate today = BASE;
        calendarService.create(c[0], new CreateEventRequest(
                "100일", today.plusDays(7), null, EventType.ANNIVERSARY, false, null));
        clearInvocations(notificationService);

        ddayNotifier.notifyFor(today);

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.ANNIVERSARY),
                eq("커플 캘린더"), contains("D-7"), anyString());
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.ANNIVERSARY),
                eq("커플 캘린더"), contains("D-7"), anyString());
    }

    /** 일주일 전에 알려도 준비할 게 없는 종류까지 울리면 알림만 늘어난다. */
    @Test
    void 데이트_약속은_일주일_전에_알리지_않는다() {
        Long[] c = couple("adv-date-a@fitto.com", "adv-date-b@fitto.com");
        LocalDate today = BASE;
        calendarService.create(c[0], new CreateEventRequest(
                "영화 보기", today.plusDays(7), null, EventType.DATE, false, null));
        clearInvocations(notificationService);

        ddayNotifier.notifyFor(today);

        verify(notificationService, never()).notify(eq(c[0]), any(), anyString(), contains("D-7"), anyString());
    }

    /** 내일 있는 일은 종류를 가리지 않고 한 번 짚어준다. */
    @Test
    void 데이트_약속도_하루_전에는_알린다() {
        Long[] c = couple("adv-1a@fitto.com", "adv-1b@fitto.com");
        LocalDate today = BASE;
        calendarService.create(c[0], new CreateEventRequest(
                "저녁 약속", today.plusDays(1), null, EventType.DATE, false, null));
        clearInvocations(notificationService);

        ddayNotifier.notifyFor(today);

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.ANNIVERSARY),
                eq("커플 캘린더"), contains("내일"), anyString());
    }

    @Test
    void 당일_알림은_그대로_간다() {
        Long[] c = couple("adv-0a@fitto.com", "adv-0b@fitto.com");
        LocalDate today = BASE;
        calendarService.create(c[0], new CreateEventRequest(
                "오늘 기념일", today, null, EventType.ANNIVERSARY, false, null));
        clearInvocations(notificationService);

        ddayNotifier.notifyFor(today);

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.ANNIVERSARY),
                eq("커플 캘린더"), contains("오늘은"), anyString());
    }
}
