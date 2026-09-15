package com.fitto.calendar.controller;

import com.fitto.calendar.dto.DateMealResponse;
import com.fitto.calendar.service.DateMealCalendarService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.common.time.KstClock;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 커플 캘린더의 데이트 기록 오버레이 API — 조회만 있다.
 *
 * <p>일정({@link CalendarController})과 경로를 나눈 이유: 이건 {@code couple_events} 의
 * 행이 아니라 <b>식단 기록을 캘린더에 겹쳐 그린 것</b>이라, 만들거나 지우는 개념이 없다
 * (고치려면 원본 식단을 고친다). 같은 경로 아래 두면 "이벤트의 한 종류"로 오해된다.
 */
@RestController
@RequestMapping("/api/v1/calendar/date-meals")
public class DateMealCalendarController {

    private final DateMealCalendarService dateMealCalendarService;

    public DateMealCalendarController(DateMealCalendarService dateMealCalendarService) {
        this.dateMealCalendarService = dateMealCalendarService;
    }

    /** 월 단위 조회 — 파라미터 생략 시 이번 달. */
    @GetMapping
    public ApiResponse<List<DateMealResponse>> month(@AuthenticationPrincipal AuthUser user,
                                                     @RequestParam(required = false) Integer year,
                                                     @RequestParam(required = false) Integer month) {
        // 기본값은 KST 기준 이번 달 — 존 없는 now() 면 매월 1일 한국 새벽에 지난달을 준다
        LocalDate now = KstClock.today();
        return ApiResponse.success(dateMealCalendarService.month(
                user.id(),
                year != null ? year : now.getYear(),
                month != null ? month : now.getMonthValue()));
    }
}
