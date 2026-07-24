package com.fitto.calendar.controller;

import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.dto.EventResponse;
import com.fitto.calendar.dto.UpdateEventRequest;
import com.fitto.calendar.service.CalendarService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** 커플 캘린더 API — 일정 CRUD + 월/다가오는 조회. */
@RestController
@RequestMapping("/api/v1/calendar/events")
public class CalendarController {

    private final CalendarService calendarService;

    public CalendarController(CalendarService calendarService) {
        this.calendarService = calendarService;
    }

    /** 월 단위 조회 — 파라미터 생략 시 이번 달. */
    @GetMapping
    public ApiResponse<List<EventResponse>> month(@AuthenticationPrincipal AuthUser user,
                                                  @RequestParam(required = false) Integer year,
                                                  @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return ApiResponse.success(calendarService.monthEvents(
                user.id(),
                year != null ? year : now.getYear(),
                month != null ? month : now.getMonthValue()));
    }

    /** 다가오는 일정 — D-day 오름차순 상위 limit 건. */
    @GetMapping("/upcoming")
    public ApiResponse<List<EventResponse>> upcoming(@AuthenticationPrincipal AuthUser user,
                                                     @RequestParam(defaultValue = "5") int limit) {
        return ApiResponse.success(calendarService.upcoming(user.id(), Math.min(limit, 20)));
    }

    @PostMapping
    public ApiResponse<EventResponse> create(@AuthenticationPrincipal AuthUser user,
                                             @Valid @RequestBody CreateEventRequest request) {
        return ApiResponse.success(calendarService.create(user.id(), request), "일정을 추가했어요.");
    }

    @PutMapping("/{eventId}")
    public ApiResponse<EventResponse> update(@AuthenticationPrincipal AuthUser user,
                                             @PathVariable Long eventId,
                                             @Valid @RequestBody UpdateEventRequest request) {
        return ApiResponse.success(calendarService.update(user.id(), eventId, request), "일정을 수정했어요.");
    }

    @DeleteMapping("/{eventId}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user,
                                    @PathVariable Long eventId) {
        calendarService.delete(user.id(), eventId);
        return ApiResponse.success(null, "일정을 삭제했어요.");
    }
}
